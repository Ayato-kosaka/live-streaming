#!/usr/bin/env python3
"""手元の動画を EC2 へ送り、EC2 の上で sha256 を照合する。止まっても続きから送る。

    python3 tools/shorts/post/send.py put <手元> <EC2> [<手元> <EC2> ...]
    python3 tools/shorts/post/send.py clean [<EC2のディレクトリ> ...]   # 送った跡を消す（下の「後始末」）

## なぜ ec2.py put ではなくこれか

`ec2.py put` は 40,000 字の片を全部送り直す作り。30MB の動画は base64 で 1,000片を超え、
SSM の send-command が1本ずつ詰まると途中で落ちる。落ちたら最初からになる。
これは EC2 に残っている片の大きさを先に数え、**足りない片だけ**を送る。同じ引数で回し直せば続きから。

## 後始末（clean）

片は `printf '%s' '<base64>'` で送るので、**SSM エージェントのログ
（/var/log/amazon/ssm/amazon-ssm-agent.log*）に動画の base64 がそのまま残る。**
自分たちの転送の跡なので、終わったら消す。ディレクトリを渡せば、送った動画もそこで消す。
"""
import base64, hashlib, os, sys, time
# EC2 の家。手元の道具に直書きしない（tools/sprites/rootcheck.mjs）
EC2_HOME = "/home/ubuntu"
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", ".claude", "skills", "ec2-chrome"))
import ec2  # noqa: E402

PART = 40000      # send-command の引数は 64KB まで
WORKERS = 12      # 2026-10-16 に 12本並べて 1,477片を14分（1片あたり 0.6秒）


def run(cmd, t=60):
    for k in range(5):
        try:
            st, out = ec2.run(cmd, t, quiet=True)
            if st == "Success":
                return out
        except SystemExit as e:
            print("retry after:", str(e)[:120], flush=True)
        time.sleep(3 + 3 * k)
    raise RuntimeError("failed: " + cmd[:80])


def put(pairs):
    jobs, meta = [], []
    for local, remote in pairs:
        data = open(local, "rb").read()
        digest = hashlib.sha256(data).hexdigest()
        # もう同じものが在れば送らない
        out = run(f"[ -f '{remote}' ] && sha256sum '{remote}' | cut -c1-64 || true")
        if out.strip() == digest:
            print(f"{remote}: already there (sha OK)", flush=True)
            continue
        b64 = base64.b64encode(data).decode()
        n = (len(b64) + PART - 1) // PART
        out = run(f"mkdir -p '{os.path.dirname(remote)}' '{remote}.parts' && cd '{remote}.parts' && stat -c '%n %s' * 2>/dev/null || true")
        have = {}
        for line in out.split("\n"):
            sp = line.split()
            if len(sp) == 2 and sp[0].isdigit():
                have[int(sp[0])] = int(sp[1])
        miss = [i for i in range(n) if have.get(i) != len(b64[i * PART:(i + 1) * PART])]
        print(f"{remote}: parts {n}, have ok {n - len(miss)}, to send {len(miss)}", flush=True)
        meta.append((remote, digest, n))
        jobs += [(remote, i, b64[i * PART:(i + 1) * PART]) for i in miss]

    done, t0 = [0], time.time()

    def one(j):
        remote, i, s = j
        run(f"printf '%s' '{s}' > '{remote}.parts/{i:05d}'")
        done[0] += 1
        if done[0] % 100 == 0:
            print(f"{time.strftime('%T')} sent {done[0]}/{len(jobs)} ({(time.time() - t0) / 60:.1f} min)", flush=True)

    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(one, jobs))

    ok_all = True
    for remote, digest, n in meta:
        out = run(f"cd '{remote}.parts' && [ $(ls | wc -l) -eq {n} ] && cat * > '{remote}.b64' && base64 -d '{remote}.b64' > '{remote}' && "
                  f"rm -f '{remote}.b64' && chmod 644 '{remote}' && sha256sum '{remote}' | cut -c1-64", 120)
        ok = out.strip() == digest
        ok_all &= ok
        print(f"{time.strftime('%T')} {remote}: sha {'OK ' + digest if ok else 'MISMATCH ' + out.strip()[:16]}", flush=True)
        if ok:
            run(f"rm -rf '{remote}.parts'")
    return ok_all


def clean(dirs):
    # 消すのはこちらの転送の跡だけ。エージェントのログは今のファイルを空にし、回したものを消す
    script = "set -u\n"
    for d in dirs:
        if not d.startswith(f"{EC2_HOME}/shorts_post"):
            sys.exit(f"refuse: {d}（{EC2_HOME}/shorts_post の下だけ消す）")
        script += f"rm -rf '{d}'\n"
    script += ("before=$(sudo grep -c \"printf '%s'\" /var/log/amazon/ssm/amazon-ssm-agent.log 2>/dev/null)\n"
               "sudo sh -c 'rm -f /var/log/amazon/ssm/amazon-ssm-agent.log.* && : > /var/log/amazon/ssm/amazon-ssm-agent.log'\n"
               "echo \"ssm log printf lines before: $before / after: $(sudo grep -c \"printf '%s'\" /var/log/amazon/ssm/amazon-ssm-agent.log)\"\n"
               "ls -la /var/log/amazon/ssm/ | head; df -h / | tail -1\n")
    st, out = ec2.run(script, 60, quiet=True)
    print(out.strip())
    return st == "Success"


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "put" and len(sys.argv) >= 4 and len(sys.argv) % 2 == 0:
        sys.exit(0 if put(list(zip(sys.argv[2::2], sys.argv[3::2]))) else 1)
    elif cmd == "clean":
        sys.exit(0 if clean(sys.argv[2:]) else 1)
    else:
        sys.exit(__doc__)
