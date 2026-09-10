# 投稿結果不明・画像欠落

## 判定と停止

- verificationの公開状態・画像URLを確認できなければ完了と報告しない。
- doNotRetry:true、note_idを持つstate、publication-attemptsの記録がある記事は再投稿しない。
- note_id/note_key、公開/編集URL、確認できた状態・画像・エラーを照合して報告する。
- 現行MCPは既存記事の更新・再公開・削除を提供しない。自動復旧できると案内しない。
- 本人がnoteエディタで同じ記事を確認し、画像添付・公開を行う。新しい記事を作らない。
- ローカル記録の訂正は、リモート状態を確定し、訂正依頼がある場合だけ行う。

## 保守時の既知仕様（2026-09-09確認）

- note_eyecatchは実寸1280×670px、width/heightも同値、既存note_idを使用する。
- HTTP 201でもJSONのerrorがあれば失敗。data.urlが必要。
- GET /api/v3/notes/{note_key}で公開状態とeyecatchを確認する。
- change_statusは公開記事の下書き戻し用途。再公開に使わない。
- 既存記事更新の保守ではID・本文・タグ・価格を保持する。現行MCPへは接続しない。
