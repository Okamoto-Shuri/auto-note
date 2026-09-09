# auto-note

note.com への記事投稿を Claude Code に自動化させるプロジェクト。
「[Getting started with loops](https://claude.com/blog/getting-started-with-loops)」で説明されている
ループエンジニアリングの考え方に沿って構成している。

## このプロジェクトがやること

1. お題（トピック）から note 用の記事本文を生成する
2. 生成した記事を自己検証する（文字数・構成・重複トピックの有無など）
3. 検証を通った記事を note に下書き保存する（既定では自動公開はしない）
4. 何を書いたか・何を投稿したかを `articles/state.json` に記録し、次回ループでの重複を防ぐ

投稿は note.com に公式の書き込み API が無いため、note の内部API（非公式・リバースエンジニアリング）
を `scripts/note_web_publish.js` から直接呼び出す。認証は Claude-in-Chrome 上でユーザーが手動で
ログイン済みのブラウザセッションにすべて委ねる（自動ログインは行わない）。

## 安全設計（重要）

- 既定はスキル・スクリプトとも `isPublish: false` 相当（下書き保存まで）。実際の公開
  （`isPublish: true` での実行）を行ってよいのは次のいずれかの場合のみ。
  1. `note-article-seo-draft` のPhase7簡易ファクトチェック（`seo-auditor` agent）を経て
     必要箇所の修正が完了した場合。改めてユーザーに公開可否を確認する必要はない。
  2. ユーザーが対象記事を個別に明示承認した場合（監査を経ていない既存ファイルなど）。
  - `/loop`・`/schedule` などの無人実行中は、1. に該当する場合でも既定では下書き保存に
    とどめ、本公開はユーザーが明示的に許可した場合のみ行う（自動投稿の暴走を防ぐため）。
- 1 ループ実行あたり生成する記事数の上限を必ず決めてから回す（例: 1 日 1 本まで）。
- 生成した記事のトピック・タイトルは `articles/state.json` の履歴と突き合わせ、重複や類似を避ける。
- 投稿先アカウントは常にユーザー本人の note アカウントであることを前提とする。他人のアカウントや
  スクレイピング目的でこの仕組みを使わない。
- ログインの自動化は行わない。note.com へのログインは常にユーザー本人が Claude-in-Chrome 上で
  手動で行う（note.com 側のボット検知でヘッドレス自動ログインが拒否されることを確認済み）。
- note.com とのやり取りは、可能な限り `note_web_publish.js` による内部APIへの直接 `fetch` で
  完結させる。Claude-in-Chrome は、ログイン済みセッションの Cookie を使わせるための実行環境
  （`javascript_tool` でのスクリプト実行、ログイン済みタブの検出）としてのみ使い、
  `computer`（クリック・スクリーンショット）や `find`/`file_upload` などの画面操作は、
  内部APIでは代替できない作業（アイキャッチ画像のスクリーンショット取得など、ユーザーが
  明示的に依頼した場合のみ）に限定する。
- `scripts/note_web_publish.js` は CSRF対策の `XSRF-TOKEN` Cookie 以外のCookie
  （セッションCookieなど認証情報に相当するもの）には一切アクセスしない。
- `note_web_publish.js` が公開する記事管理系機能（下書き削除 `deleteDraft`、公開記事の下書き
  差し戻し `unpublishNote`、公開記事の削除 `deleteNote`）は取り消しが効かない、または効きにくい
  破壊的操作なので、`isPublish: true` での公開と同様、実行前に必ずユーザーの明示確認を取る。
  `/loop`・`/schedule` などの無人実行中にこれらを呼び出すことは行わない。
- `note_web_publish.js` は「自分の記事を書いて投稿・管理する」という目的の範囲のAPIのみを実装
  する。note の内部APIにはこの他にもいいね・フォロー・コメント投稿・メンバーシップ/掲示板の
  作成運用などが存在するが、自動ログイン同様、意図的にスコープ外としている
  （他人のコンテンツへの自動的な書き込みになり得るため）。
- note の内部APIは非公式・リバースエンジニアリングによるものであり、note 側の仕様変更で
  壊れる可能性がある前提で運用する。過度な自動投稿・スパム的な連続投稿はしない。

## ループの種類と使い分け

記事の 4 分類に沿って、このリポジトリでは主に以下を使う。

| 種類 | 起動方法 | 停止条件 | 用途 |
|---|---|---|---|
| ターンベース | 通常のプロンプト / `note-article-seo-draft` スキル呼び出し | 記事が生成・Phase7ファクトチェック/修正を通り、（依頼されていれば）投稿まで完了するまで | 1 本だけSEOを狙って書かせ、必要なら投稿まで任せたいとき |
| ゴールベース | `/goal` | 目標本数に到達 or 最大試行回数 | 「今週中に3本ドラフトを作る」等 |
| 時間ベース | `/loop` または `/schedule` | ユーザーがキャンセルするまで | 定期的にネタを1本ずつドラフトする |
| プロアクティブ | `/schedule` の cron ルーチン | 手動停止まで | 完全自動運用（下書きまで） |

具体的な起動例は `README.md` を参照。

## スキルとagentの使い分け

このリポジトリの基本単位は「1つの対話セッションが呼び出すスキル」だが、以下の条件を
**両方**満たす工程だけは、専任のsubagent（`.claude/agents/`）に切り出す。

1. ユーザーとの対話（`AskUserQuestion` など）が不要で、単独で完結する
2. 独立性・客観性、またはコンテキストの汚染防止（大量の生の調査結果を主文脈に残さない）に
   明確な意味がある

代表例が `note-article-seo-draft` のPhase7（簡易ファクトチェック）で、記事を書いた本人（＝執筆時の対話
文脈）が自分の記事をチェックすると見落としが生じやすい。執筆の経緯を共有しない独立agent
（`seo-auditor`）に完成品だけを見せて客観的・簡易的にファクトチェックさせることで、
見落としを避けている。同様の理由で検索意図分析（`seo-researcher`）・差別化/構成設計
（`seo-planner`）も専任agentに分離している。詳細は
`.claude/skills/note-article-seo-draft/SKILL.md` の「エージェント構成」を参照。

分離理由がバイアス回避ではなくコンテキスト汚染防止の場合もある。`note-article-publish` の
アイキャッチ画像生成（`eyecatch-generator`）がその例で、HTMLテンプレートの文言差し替え自体は
単純作業だが、ArtifactでのHTML描画・Claude-in-Chromeでのスクリーンショット取得・クロップという
一連のブラウザ操作は独立性が必要というよりも生の中間結果（スクリーンショット・タブ操作ログ等）
が多く、投稿処理本体の文脈に残す価値が無い。完成したPNGのファイルパスだけを呼び出し元に
返す専任agentに切り出すことで、投稿スキル側の文脈をきれいに保っている。

逆に、文体の一貫性が必要な工程（タイトル〜本文〜FAQ・CTAなど）や、ユーザーとの対話が
必須の工程（要件ヒアリング、投稿の最終承認）は分割せず、スキルを呼び出しているセッション
自身が担当する。

## ディレクトリ構成

```
.claude/agents/
  seo-researcher.md      note-article-seo-draft のPhase1（検索意図分析）専任agent。
                         WebSearch/WebFetchで実際に確認した事実のみを根拠に調査する
  seo-planner.md          note-article-seo-draft のPhase2・3（差別化設計・構成設計）専任agent
  seo-auditor.md          note-article-seo-draft のPhase7（簡易ファクトチェック）専任agent。書き手の文脈を
                         引き継がない独立した第三者として簡易ファクトチェックを行う（自分ではファイルを編集しない）
  eyecatch-generator.md   note-article-publish から呼ばれるアイキャッチ画像生成専任agent。
                         templates/eyecatch_template.html への文言差し替え〜Artifact公開〜
                         Claude-in-Chromeでのスクリーンショット/クロップまでを単独で行い、
                         保存済みPNGのファイルパスだけを返す
.claude/skills/
  note-topic-ideas/       トピック案をバックログに追加するスキル
  note-article-seo-draft/ 8段階SEOパイプライン（要件定義〜検索意図分析〜差別化設計〜構成設計〜
                          タイトル/導入〜本文執筆〜実装要素〜簡易ファクトチェック）で記事を生成する、
                          このリポジトリ唯一の記事生成スキル。既存記事のリライトにも使う。
                          Phase7のファクトチェック（および必要箇所の修正）が完了した記事は、続けて
                          note-article-publish に isPublish: true で本公開まで任せてよい。
                          詳細は同ディレクトリの references/pipeline.md 参照
  note-article-publish/   承認済み下書きを note_web_publish.js 経由で note に投稿するスキル。
                          実処理はすべて内部APIへの直接fetchで完結させ、Claude-in-Chromeの
                          画面操作（computer等）は自身では行わず、アイキャッチ画像が必要な
                          場合（明示依頼時のみ）は eyecatch-generator agentに委譲する
scripts/
  note_web_publish.js     Claude-in-Chrome 上で実行する、note 内部APIを直接叩く投稿スクリプト
templates/
  eyecatch_template.html  記事アイキャッチ画像のHTMLテンプレート（{{KICKER}}/{{TITLE}}を差し替えて使う）
articles/
  drafts/                note-article-seo-draft が生成した記事の Markdown（`<slug>.md`）と、
                         同名で拡張子違いの `<slug>.seo-brief.md`
                         （設計・監査資料。note には投稿しない内部資料）が併存する
  published/              note に投稿済みの記事のアーカイブ
  state.json              トピック履歴・投稿履歴・重複防止用の状態
```

## 記事のスタイルガイド

（トーン・文字数の目安など、他は未設定。追記していく。記事生成スキルはこのセクションを
必ず読んでから執筆すること。）

- **一次情報（EEAT）を書かない**: 自分自身の実績・経験・データなどの一次情報は、記事に
  一切書かない方針で固定する。`note-article-seo-draft` の Phase 0 でこの項目をユーザーに
  確認する必要はなく、常に「一次情報なし」として進める（一次情報前提の差別化案は選ばない）。
- **本文の文字数は 4,000〜6,000字のレンジとする**（4,000〜6,000字に固定する）。
  この範囲（`{MIN_CHAR}`=4,000, `{MAX_CHAR}`=6,000）は、`note-article-seo-draft` の
  Phase 0 で毎回ユーザーに確認せず既定値として使う。アウトライン設計（Phase 3）や
  本文執筆（Phase 5）においても合計文字数が4,000〜6,000字に収まるよう配分・調整する。
