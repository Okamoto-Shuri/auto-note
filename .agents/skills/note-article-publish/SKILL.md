---
name: note-article-publish
description: articles/drafts/ の承認済み・監査済み記事を、専用Chromeセッションと note_publisher MCPでnote.comへ下書き保存または本公開する。アイキャッチ生成・添付とstate.json更新まで行う。
---

# note-article-publish

`note_publisher` MCPを使い、ユーザー本人が手動ログインした専用Chromeプロファイル内で
`scripts/note_web_publish.js` を実行する。noteとの書き込みは内部APIへの直接`fetch`で完結し、
エディタのクリック操作やログイン自動化は行わない。

## 前提と公開条件

- 1回につき1記事だけ処理する。
- 対象は`articles/drafts/`内の本文Markdownとする。`*.seo-brief.md`は投稿しない。
- アイキャッチは必須。未生成なら`eyecatch-generator` agentに委譲し、1280×670pxのPNGを
  `articles/drafts/images/`へ生成する。既に対象記事用の完成済み画像がある場合は再生成しない。
- 公開指定がなければ`is_publish: true`。ユーザーが下書きのみを指定した場合、または
  `/loop`・`/schedule`などの無人実行では`is_publish: false`。
- 本公開には、同名SEO briefのPhase 7に「指摘事項なし」または「反映済み」の記録が必要。
  監査記録がない既存記事は、ユーザーが個別承認した場合だけ`user_approved: true`を渡せる。
- 有料記事では本文の`<pay>`が1行のみ・1回のみであることを確認し、`price`を指定する。

## 実行

1. `note_session_status`で専用セッションを確認する。
2. ブラウザ未起動または未ログインなら`open_note_login`を呼ぶ。未ログインの場合だけ、開いた
   Chromeでユーザー本人に手動ログインしてもらい、完了後に再確認する。認証情報は尋ねない。
3. 条件を満たしたら`publish_note`へ本文パス、アイキャッチパス、公開区分を渡す。タグ等は記事設計に
   根拠がある場合だけ渡す。1〜2回を超えて自動リトライしない。
4. 成功後は、公開記事の取得結果で`status: published`（または`is_published: true`）と
   `eyecatch`のURLが両方存在することを確認する。投稿APIのHTTP成功だけで完了扱いにしない。
5. 戻り値のURLを報告する。MCPが成功時に`articles/state.json`を更新し、本公開なら本文を
   `articles/published/`へ移動するため、同じ更新を手作業で重複実行しない。

呼び出し例:

```json
{
  "draft_path": "articles/drafts/example.md",
  "eyecatch_path": "articles/drafts/images/eyecatch-example.png",
  "is_publish": true,
  "hashtags": ["AI"]
}
```

## 境界

- MCPは下書き保存・本公開だけを公開し、削除、公開取り消し、いいね、フォロー、コメント、
  ログイン操作は実装しない。
- セッションCookieをMCPプロセスへ抽出しない。ページ内スクリプトがCSRF用`XSRF-TOKEN`だけを読み、
  ブラウザ自身の認証済み`fetch`を使う。
- 内部API変更や連続エラーが疑われる場合は停止し、エラーをそのまま報告する。

## 投稿後の修復

公開結果に画像がない、またはユーザーが同じ記事を下書きへ戻した場合は、重複記事を新規作成しない。
既存の`note_key`と`note_id`を`articles/state.json`および記事取得APIから確定し、既存ノートへ
アイキャッチを再アップロードしてから同じノートを更新・再公開する。具体的な既知仕様と確認項目は、
この復旧が必要な場合に限り[references/eyecatch-recovery.md](references/eyecatch-recovery.md)を読む。
