# アイキャッチ欠落時の復旧メモ

## 2026-09-09に確認した内部APIの挙動

- `POST /api/v1/image_upload/note_eyecatch`のフォームには、実画像と一致する
  `width=1280`、`height=670`、既存の`note_id`を渡す。
- noteは画像検証エラーでもHTTP 201を返すことがある。HTTPステータスだけでは成功と判定せず、
  JSON本文に`error`がないことと`data.url`が存在することを必ず確認する。
- `POST /api/v2/notes/{note_key}/change_status`は公開記事を下書きへ戻す用途であり、
  下書きの再公開には使わない。再公開は既存`note_id`に対する記事更新PUTで行う。
- 復旧時は新しいノートの骨組みを作らない。`articles/state.json`の記録と
  `GET /api/v3/notes/{note_key}`の結果を突き合わせ、同一記事のIDを使う。

## 最短の確認順序

1. 記事取得APIで対象が下書きであり、`eyecatch`が空であることを確認する。
2. 既存`note_id`へ1280×670pxの画像をアップロードし、レスポンスの`data.url`を確認する。
3. 記事取得APIをもう一度呼び、`eyecatch`にURLが設定されたことを確認する。
4. 同じ`note_id`を記事更新PUTで公開する。本文・タグ・価格など既存値を保持する。
5. 最後に記事取得APIで`status: published`または`is_published: true`、かつ
   `eyecatch` URLありを確認して完了とする。

途中でレスポンス形式が異なる場合は、推測で別エンドポイントを連打せず停止する。
