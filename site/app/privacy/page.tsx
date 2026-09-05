import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "あやと島が YouTube のログインで何を取得し、どう使うか。",
};

/**
 * プライバシーポリシー。
 *
 * YouTube ログイン（`youtube.readonly` スコープ）の Google 審査に、
 * 公開URLとして提出するために作った。島の他の面と違って読み物ではないので、
 * 島の顔（`PageHead` の案内役や絵）は付けず、見出しと本文だけの面にしている。
 */
export default function PrivacyPage() {
  return (
    <PageShell crumbs={[{ label: "プライバシーポリシー" }]}>
      <PageHead title="プライバシーポリシー" lead={`${SITE.name}（${SITE.url}）における個人情報の取り扱い。`} />

      <Panel>
        <h2>YouTube でログインすると取得する情報</h2>
        <p>
          「YouTubeでログイン」を押すと、Google の同意画面を経由して、あなたの YouTube
          チャンネルの次の情報だけを読み取ります（読み取り専用スコープ{" "}
          <code>https://www.googleapis.com/auth/youtube.readonly</code>）。
        </p>
        <ul>
          <li>チャンネル名</li>
          <li>チャンネルアイコン（画像URL）</li>
          <li>チャンネルID</li>
        </ul>
        <p>
          動画の投稿・編集・削除、チャンネル設定の変更など、読み取り以外のことは一切できません。
          このログインでは、あなたの YouTube 上の操作は何も行われません。
        </p>
      </Panel>

      <Panel>
        <h2>何のために使うか</h2>
        <ul>
          <li>企画掲示板（<code>/board</code>）に出した投稿を、あなたのものだと分かるようにする</li>
          <li>スマートフォンとパソコンなど、端末をまたいでも同じ人として扱う</li>
          <li>ログイン時に「出す」を選んだ場合のみ、島の上にチャンネル名・アイコンを表示する</li>
          <li>配信中のライブチャットのコメントと、同じ人かどうかを突き合わせる</li>
        </ul>
        <p>
          名前やアイコンを島に出すかどうかは、ログイン後の画面でいつでも選べます。
          何も選ばなければ、他の人には表示されません。
        </p>
      </Panel>

      <Panel>
        <h2>保存する場所と期間</h2>
        <p>
          取得した情報は、上記の目的のためだけに Firebase（Google Cloud）上のデータベースに保存します。
          第三者への販売・提供は行いません。削除をご希望の場合は、下記の連絡先までご連絡ください。
          確認の上、保存している情報を削除します。
        </p>
      </Panel>

      <Panel>
        <h2>ブラウザに保存する情報</h2>
        <p>
          「一度ログインしたことがある端末か」を覚えておくために、ブラウザの localStorage に
          小さな印を1つだけ保存します。個人を特定できる情報は含みません。ブラウザの設定から
          いつでも消せます。
        </p>
      </Panel>

      <Panel>
        <h2>Google のポリシーの遵守</h2>
        <p>
          {SITE.name}による Google ユーザーデータの利用および他アプリへの転送は、
          Limited Use の要件を含む Google API Services User Data Policy を遵守します。
        </p>
      </Panel>

      <Panel>
        <h2>お問い合わせ</h2>
        <p>
          このページの内容や、保存されている情報の確認・削除については、
          <a href="mailto:kosaka.ayato@gmail.com">kosaka.ayato@gmail.com</a> までご連絡ください。
        </p>
        <p className="phead-lead">最終更新日: 2026年9月5日</p>
      </Panel>
    </PageShell>
  );
}
