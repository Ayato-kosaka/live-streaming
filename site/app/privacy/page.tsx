import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { share } from "@/lib/share";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { LINKS, SITE } from "@/content/site";
import "./privacy.css";

export const metadata: Metadata = share({
  key: "home",
  title: "プライバシーポリシー",
  description: "あやと島が YouTube のログインで何を取得し、どう使うか。",
  path: "/privacy",
});

/**
 * プライバシーポリシー。
 *
 * YouTube ログイン（`youtube.readonly` スコープ）の Google 審査に、
 * 公開URLとして提出している面。**道（`/privacy`）を変えない。** 審査に出した URL が死ぬ。
 * 島の他の面と違って読み物ではないので、島の顔（`PageHead` の案内役や絵）は付けず、
 * 見出しと本文だけの面にしている。
 *
 * ## 書いてあることは、コードの書く所と1対1で合わせる
 *
 * 審査の人は「書いてあることと、実際に取って保存しているものが同じか」を見る。
 * 前の版は「ハンドルを保存している」が抜けていて、「何も選ばなければ他の人には
 * 表示されません」も、ログインしたまま貼った付箋・企画には当たっていなかった
 * （書き手の名前が付いて誰でも読める）。**書く所を変えたら、ここも変える。**
 *
 * - 本人の書類 … `functions/src/islandApi.ts` の `POST /me`（`islandUsers/{uid}`）。
 *   視聴者さんの書類に書くのは、島じゅうでここ1か所だけ（下の `STORED`）
 * - 読みに行く先 … `functions/src/youtubeOwner.ts`（`channels?mine=true` の1回）と
 *   `site/lib/auth.tsx` の `fetchChannel`（画面に出すための同じ1回）
 * - 書き手の名前 … 同じ `islandApi.ts` の `POST /stickies`・`POST /nextplans` の `by`
 * - いま島にいる人 … `site/components/live/Here.tsx`（`islandHere/{uid}`。出すと決めた人だけ）
 * - 毎晩の退避 … `python/backup/sink.py` の `KEEP_DAYS`（90日）
 *
 * `islandUsers` には運営者（あやと）の書類にだけ入る欄もある
 * （`admin`・`rouletteId`・`alertboxId`・`doneruKey`。どれも `ownerUid()` を通った口だけが書く）。
 * 視聴者さんの書類には入らないので、ここには並べない。
 *
 * ## 英語の版を同じ面に置く
 *
 * 審査の人は英語で読む。別の面にすると、出した URL と読まれる中身が分かれる。
 * 日本語の下に `lang="en"` の節として置き、中身は日本語と同じ順に並べる。
 * 「保存するもの」は両方を同じ表（`STORED`）から出すので、片方だけ増えることはない。
 *
 * ## 畳まない
 *
 * 長い文は畳むのが島の決まり（`docs/island-design.md` 4章）だが、ここは法的な文書で、
 * 審査の人が開かずに読める必要がある。正確さと見えることを、島の決まりより先に置く。
 */

/** 最終更新の日。中身を変えたら、ここを変える（日本語と英語の両方に出る）。 */
const UPDATED = "2026-11-14";

const [UY, UM, UD] = UPDATED.split("-").map(Number);
const UPDATED_JA = `${UY}年${UM}月${UD}日`;
const UPDATED_EN = new Date(Date.UTC(UY, UM - 1, UD)).toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** 問い合わせ先。**名刺の表（`LINKS`）から引く。** ここに宛先を書き写さない。 */
const CONTACT = (() => {
  const yt = LINKS.find((l) => l.id === "youtube");
  // 無ければ書き出しで落とす。宛先の無いプライバシーポリシーを黙って配らない
  if (!yt) throw new Error("privacy: LINKS に youtube が無い");
  return yt.href;
})();

/** 英語の版での呼び名。`SITE.name`（あやと島）を英文の主語にしない。 */
const NAME_EN = "Ayato Island";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const USER_DATA_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";
/* YouTube API Services の開発者ポリシーが「取り消しかたはここ」と名指ししている場所。
   いまは Google アカウントの「サードパーティ製のアプリとサービス」へ送られる。 */
const REVOKE = "https://security.google.com/settings/security/permissions";
const YT_TERMS = "https://www.youtube.com/t/terms";
const GOOGLE_PRIVACY = "https://policies.google.com/privacy";

/**
 * 本人の書類（`islandUsers/{uid}`）に保存するもの。**`POST /me` が書く欄と1対1。**
 * 欄を足したり減らしたりしたら、ここも同じだけ動かす。
 */
const STORED: { field: string; ja: string; en: string }[] = [
  { field: "channelId", ja: "チャンネルID", en: "Channel ID" },
  { field: "handle", ja: "ハンドル", en: "Handle" },
  {
    field: "name",
    ja: "名前（ハンドル。無ければチャンネル名。どちらも読めなかったときは Google アカウントの表示名）",
    en: "Name (your handle; if there is none, your channel name; if neither could be read, your Google account display name)",
  },
  {
    field: "photo",
    ja: "チャンネルアイコンの画像 URL（画像そのものは保存しません）",
    en: "Channel icon URL (not the image itself)",
  },
  { field: "nickname", ja: "島での呼び名（自分で入れたときだけ）", en: "The nickname you set on the island (only if you set one)" },
  {
    field: "showName / showPhoto",
    ja: "名前を島に出すか・アイコンを島に出すかの選択",
    en: "Your choice of whether to show your name, and whether to show your icon, on the island",
  },
  {
    field: "firstSeenAt / lastSeenAt",
    ja: "はじめてログインした時刻と、最後に島を開いた時刻",
    en: "When you first signed in, and when you last opened the island",
  },
  {
    field: "handleAt",
    ja: "ハンドルが分からなかったときに、公開の情報から探し直した日",
    en: "The date we last looked up your handle from public data, if it was missing",
  },
];

/** よその場所への行き先。新しいタブで開く。 */
function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Japanese() {
  return (
    <>
      <Panel>
        <h2>ログインすると、何を読むか</h2>
        <p>
          「YouTubeでログイン」を押すと、Google の同意画面で、YouTube を読むだけの許可（
          <code>{SCOPE}</code>）をお願いします。許可をもらうと、ログインの直後に、あなた自身のチャンネルについて次の4つを読みます。
        </p>
        <ul>
          <li>チャンネルID</li>
          <li>ハンドル（@ で始まる名前）</li>
          <li>チャンネル名</li>
          <li>チャンネルアイコンの画像 URL</li>
        </ul>
        <p>
          同じ問い合わせを2回します。名前とアイコンをすぐ出すためにブラウザの中で1回、そのチャンネルが本当にあなたのものかを確かめるために島のサーバーで1回です。
        </p>
        <p>
          動画・再生リスト・登録チャンネル・コメント・メンバーシップ・アナリティクスは読みません。YouTube への投稿・編集・削除・設定の変更も、一切しません。
        </p>
        <p>
          ログインの仕組み（Google の Firebase Authentication）は、Google アカウントの基本の情報（アカウントの ID・メールアドレス・表示名・プロフィール写真）を受け取ります。
        </p>
      </Panel>

      <Panel>
        <h2>何に使うか</h2>
        <ul>
          <li>
            配信のライブチャットのコメントやスーパーチャットと、同じ人かどうかをチャンネルIDで結びます。島のキャラクターやカードを、あなたのものとして見せるためです
          </li>
          <li>島に貼った付箋・出した企画・投票を、端末を変えても、あなたのものとして扱います</li>
          <li>「出す」と選んだときだけ、島の上に名前とアイコンを出します</li>
        </ul>
        <p>
          広告には使いません。売りません。汎用の AI や機械学習のモデルを作ったり鍛えたりするためにも使いません。
        </p>
      </Panel>

      <Panel>
        <h2>何を保存するか</h2>
        <p>Google の Firebase（Google Cloud）のデータベースに、ログインしたアカウントごとに1つ、次のものを保存します。</p>
        <ul>
          {STORED.map((s) => (
            <li key={s.field}>{s.ja}</li>
          ))}
        </ul>
        <p>ほかに、次のものも残ります。</p>
        <ul>
          <li>Firebase Authentication のログインの記録（アカウントの ID・メールアドレス・表示名・プロフィール写真・ログインした時刻）</li>
          <li>
            ログインしたまま貼った付箋・出した企画・投票・ハートには、アカウントの ID が付きます。付箋と企画には、そのときの名前も付きます
          </li>
          <li>
            名前かアイコンを出すと選んだ人は、島のページを開いているあいだ、いま見ているページ・島の上の位置・時刻を置きます。ほかの人の画面にあなたの姿を出すためで、ページを離れると消します
          </li>
          <li>
            保存したチャンネルIDで、公開されているハンドルとアイコンを YouTube から取り直して保存することがあります。このときは運営の側の YouTube の許可を使い、あなたの許可は使いません
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>保存しないもの</h2>
        <ul>
          <li>
            Google の OAuth のアクセストークン。島のサーバーに HTTPS で1回だけ送り、上の4つを読む1回の問い合わせに使って、捨てます。データベースにもログにも書きません
          </li>
          <li>リフレッシュトークン。オフラインアクセスを求めていないので、受け取りません</li>
          <li>上の4つ以外の、YouTube の情報</li>
          <li>Google アカウントのパスワード。島には届きません</li>
        </ul>
      </Panel>

      <Panel>
        <h2>誰に見えるか</h2>
        <ul>
          <li>
            ほかの人に見えるのは、あなたが「出す」と選んだ名前（呼び名を入れていれば呼び名）とアイコンです。はじめは、どちらも出しません
          </li>
          <li>出すと選ぶと、いま島にいることと、どのページを見ているかも、ほかの人の画面に出ます</li>
          <li>
            ログインしたまま付箋を貼ったり企画を出したりすると、書き手としてあなたの名前（ハンドルなど）が付き、誰でも読めます
          </li>
          <li>チャンネルID とメールアドレスは、ほかの人に見せません</li>
          <li>本人の記録（「何を保存するか」の最初の一覧）は、ブラウザから直接は読めません。読めるのは島のサーバーと、島の運営だけです</li>
          <li>
            売りません。ほかの会社や人に渡しません。保存しているのは Google（Firebase・Google Cloud）の上です。毎晩の手入れ（バックアップやアイコンの取り直し）は GitHub Actions の上で動かしていて、そのあいだだけそこで読みます
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>いつまで置いておくか</h2>
        <ul>
          <li>消してほしいと言われるまで置きます。期限で消えることはありません</li>
          <li>
            毎晩のバックアップ（Google Cloud）にも写しが入り、写しは90日で消えます。消したあとも、最長90日はバックアップに残ります
          </li>
          <li>ログアウトしても、保存したものは消えません。ログアウトは、その端末でのログインを終えるだけです</li>
        </ul>
      </Panel>

      <Panel>
        <h2>やめたいとき・消したいとき</h2>
        <ul>
          <li>
            名前とアイコンを隠す …{" "}
            <Link href="/me" prefetch={false}>
              じぶんのこと
            </Link>
            の「名前とアイコンを、島に出すか」で、出すのをやめます
          </li>
          <li>
            島への許可を取り消す … Google アカウントの
            <Out href={REVOKE}>サードパーティ製のアプリとサービス</Out>
            から、いつでも取り消せます
          </li>
          <li>
            保存したものを消す … 島の中には、まだ自分で消すボタンがありません。下の「お問い合わせ」のメールに、ログインに使ったチャンネルの名前かハンドルを添えて「あやと島のデータを消して」と書いてください。確かめたうえで、上の「何を保存するか」の本人の記録と Firebase のログインの記録を消し、付箋・企画・投票・ハートに付いたアカウントの ID と名前も消します
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>ブラウザに置くもの</h2>
        <ul>
          <li>この端末でログインしたことがある印と、アカウントの ID。ログアウトすると消えます</li>
          <li>Google のログインの状態（Firebase Authentication が、ブラウザの保存領域に置きます）</li>
          <li>
            ログインしなくても置くもの … 端末ごとのランダムな ID（1人1票と、書き込みの回数の歯止めのため）と、押したハート・選んだ票・来た日などの覚え書き
          </li>
        </ul>
        <p>アクセス解析や広告の仕組みは使っていません。どれも、ブラウザの設定から消せます。</p>
      </Panel>

      <Panel>
        <h2>Google のポリシー</h2>
        <p>
          {SITE.name}が Google の API から受け取った情報の使いかたと、ほかのアプリへの受け渡しは、Limited Use の要件を含む{" "}
          <Out href={USER_DATA_POLICY}>Google API Services User Data Policy</Out> に従います。
        </p>
        <p>
          {SITE.name}は YouTube API サービスを使っています。
          <Out href={YT_TERMS}>YouTube 利用規約</Out>と
          <Out href={GOOGLE_PRIVACY}>Google のプライバシーポリシー</Out>
          もご覧ください。
        </p>
      </Panel>

      <Panel>
        <h2>このページを変えるとき</h2>
        <p>中身を変えたときは、いちばん上の「最終更新」の日付を変えます。</p>
      </Panel>

      <Panel>
        <h2>お問い合わせ</h2>
        <p>
          このページのことや、保存している情報を見たい・消してほしいときは、
          <a href="mailto:kosaka.ayato@gmail.com">kosaka.ayato@gmail.com</a>
          にメールしてください。ログインに使ったチャンネルの名前かハンドルを書いてもらえると、どの記録かが分かります。
          <Out href={CONTACT}>あやとの YouTube チャンネル</Out>
          の配信のチャットや動画のコメントでも受けますが、コメントは誰でも読めるので、メールアドレスなどは書かないでください。
        </p>
      </Panel>
    </>
  );
}

function English() {
  return (
    <section lang="en" id="en" aria-labelledby="ppol-en" className="ppol-en">
      <Panel>
        <h2 id="ppol-en">Privacy Policy (English)</h2>
        <p>
          How {NAME_EN} (<span lang="ja">{SITE.name}</span>, {SITE.url}) handles the information it
          receives when you sign in with YouTube. This is the English version of the policy above.
        </p>
        <p>
          Last updated: <time dateTime={UPDATED}>{UPDATED_EN}</time>
        </p>
      </Panel>

      <Panel>
        <h2>What we read when you sign in</h2>
        <p>
          When you press &ldquo;<span lang="ja">YouTubeでログイン</span>&rdquo; (Sign in with YouTube), Google&rsquo;s consent screen asks you for
          read-only access to YouTube (<code>{SCOPE}</code>). Right after you sign in, we read these four things about
          your own channel:
        </p>
        <ul>
          <li>Channel ID</li>
          <li>Handle (the name that starts with @)</li>
          <li>Channel name</li>
          <li>Channel icon URL</li>
        </ul>
        <p>
          We make the same request twice: once in your browser, to show your name and icon right away, and once on our
          server, to confirm that the channel really belongs to you.
        </p>
        <p>
          We do not read your videos, playlists, subscriptions, comments, memberships or analytics. We never post, edit,
          delete or change anything on YouTube.
        </p>
        <p>
          Sign-in itself runs on Google&rsquo;s Firebase Authentication, which receives your Google account&rsquo;s basic
          profile: account ID, email address, display name and profile photo.
        </p>
      </Panel>

      <Panel>
        <h2>How we use it</h2>
        <ul>
          <li>
            To link you, by channel ID, with your live chat messages and Super Chats on Ayato&rsquo;s streams, so that
            your island character and cards show as yours
          </li>
          <li>To keep the sticky notes, plan ideas and votes you post as yours, on any device</li>
          <li>To show your name and icon on the island, only if you choose to</li>
        </ul>
        <p>
          We do not use it for advertising and we do not sell it. We do not use it to develop or train generalized AI
          or machine learning models.
        </p>
      </Panel>

      <Panel>
        <h2>What we store</h2>
        <p>In Google&rsquo;s Firebase (Google Cloud) database, one record per signed-in account, containing:</p>
        <ul>
          {STORED.map((s) => (
            <li key={s.field}>{s.en}</li>
          ))}
        </ul>
        <p>We also keep:</p>
        <ul>
          <li>
            Firebase Authentication&rsquo;s sign-in record (account ID, email address, display name, profile photo and
            sign-in times)
          </li>
          <li>
            Your account ID on the sticky notes, plan ideas, votes and hearts you post while signed in. Sticky notes and
            plan ideas also keep the name you had at the time
          </li>
          <li>
            If you chose to show your name or icon: while you have the island open, the page you are on, your position
            on the island map and the time, so that other visitors can see you there. We remove it when you leave the
            page
          </li>
          <li>
            Your current public handle and channel icon, which we may look up again on YouTube with your stored channel
            ID and save. This uses our own YouTube credentials, not your permission
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>What we do not store</h2>
        <ul>
          <li>
            Your Google OAuth access token. It is sent to our server once over HTTPS, used for the single request
            above, and then discarded. It is never written to our database or to logs
          </li>
          <li>A refresh token. We do not ask for offline access, so we never receive one</li>
          <li>Any YouTube data other than the four items above</li>
          <li>Your Google password. It never reaches us</li>
        </ul>
      </Panel>

      <Panel>
        <h2>Who can see it</h2>
        <ul>
          <li>
            Other visitors see only the name (or your nickname, if you set one) and the icon you chose to show. Both
            are hidden until you turn them on
          </li>
          <li>If you show them, other visitors can also see that you are on the island and which page you are viewing</li>
          <li>
            Sticky notes and plan ideas you post while signed in carry your name (such as your handle) as the author,
            and anyone can read them
          </li>
          <li>We never show your channel ID or email address to other visitors</li>
          <li>
            Your account record (the first list under &ldquo;What we store&rdquo;) cannot be read directly from
            browsers. Only our server and the people who run {NAME_EN} can
          </li>
          <li>
            We do not sell your data or give it to other companies or people. It is stored on Google (Firebase and
            Google Cloud). Our nightly maintenance jobs (backups and refreshing icons) run on GitHub Actions and read it
            there while they run
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>How long we keep it</h2>
        <ul>
          <li>Until you ask us to delete it. It does not expire on its own</li>
          <li>
            A copy goes into our nightly backup (Google Cloud), and each copy is deleted after 90 days. After we delete
            your data, it may remain in backups for up to 90 days
          </li>
          <li>Signing out does not delete anything. It only ends your sign-in on that device</li>
        </ul>
      </Panel>

      <Panel>
        <h2>How to stop, and how to delete</h2>
        <ul>
          <li>
            Hide your name and icon: on{" "}
            <Link href="/me" prefetch={false} lang="ja">
              じぶんのこと
            </Link>{" "}
            (My page), under &ldquo;<span lang="ja">名前とアイコンを、島に出すか</span>&rdquo; (whether to show your
            name and icon), turn them off
          </li>
          <li>
            Revoke our access: at any time, in your Google Account under{" "}
            <Out href={REVOKE}>Third-party apps &amp; services</Out>
          </li>
          <li>
            Delete your data: there is no delete button on the island yet. Email us (see &ldquo;Contact&rdquo; below) with the
            name or handle of the channel you signed in with, and say you want your {NAME_EN} data deleted. After checking, we delete your record listed
            under &ldquo;What we store&rdquo; and your Firebase sign-in record, and remove your account ID and name from
            your sticky notes, plan ideas, votes and hearts
          </li>
        </ul>
      </Panel>

      <Panel>
        <h2>What we keep in your browser</h2>
        <ul>
          <li>A mark that you have signed in on this device, with your account ID. It is removed when you sign out</li>
          <li>Your sign-in session, kept by Firebase Authentication in your browser&rsquo;s storage</li>
          <li>
            Even without signing in: a random ID for this device (for one vote per person and limits on posting), and
            small notes such as the hearts you pressed, the votes you chose and the days you visited
          </li>
        </ul>
        <p>We do not use analytics or advertising tools. You can clear all of this in your browser settings.</p>
      </Panel>

      <Panel>
        <h2>Google&rsquo;s policies</h2>
        <p>
          {NAME_EN}&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to{" "}
          <Out href={USER_DATA_POLICY}>Google API Services User Data Policy</Out>, including the Limited Use
          requirements.
        </p>
        <p>
          {NAME_EN} uses YouTube API Services. See also the <Out href={YT_TERMS}>YouTube Terms of Service</Out> and
          the <Out href={GOOGLE_PRIVACY}>Google Privacy Policy</Out>.
        </p>
      </Panel>

      <Panel>
        <h2>Changes to this policy</h2>
        <p>When we change this page, we update the &ldquo;Last updated&rdquo; date.</p>
      </Panel>

      <Panel>
        <h2>Contact</h2>
        <p>
          For questions about this page, or to see or delete your data, email{" "}
          <a href="mailto:kosaka.ayato@gmail.com">kosaka.ayato@gmail.com</a>. Tell us the name or handle of the
          channel you signed in with so we can find your record. You can also write in the live chat or a video
          comment on <Out href={CONTACT}>Ayato&rsquo;s YouTube channel</Out>, but comments are public, so please do
          not include your email address or other personal details there.
        </p>
      </Panel>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PageShell crumbs={[{ label: "プライバシーポリシー" }]}>
      {/* 読む字の柱を1本に決めるための包み（`privacy.css`）。
          1440px でも 1920px でも本文の1行が 79.2ch あって、PC で読む人だけが
          損をしていた。ここは面ごとの決めごとなので、島ぜんぶの `.panel` には触らない。 */}
      <div className="ppol">
        <PageHead
          title="プライバシーポリシー"
          lead={
            <>
              {SITE.name}（{SITE.url}）で YouTube のログインを使ったときに、何を受け取り、何を保存し、どう扱うか。{" "}
              <a className="phead-go" href="#en" lang="en" hrefLang="en">
                English
              </a>
            </>
          }
          meta={
            <p className="ppol-date">
              最終更新 <time dateTime={UPDATED}>{UPDATED_JA}</time>
            </p>
          }
        />

        <Japanese />
        <English />
      </div>
    </PageShell>
  );
}
