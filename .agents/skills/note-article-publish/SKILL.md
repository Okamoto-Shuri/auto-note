---
name: note-article-publish
description: 監査済みnote記事を必須アイキャッチ付きで下書き保存・本公開し、公開状態と画像の反映を検証する。
---

# note-article-publish

## 入力と条件

- 対象はdrafts内の本文1本。seo-briefは投稿しない。ルートのdocs/note-format.mdを読む。
- 本公開には同名briefのPhase 7に「指摘事項なし」または「反映済み」が必要。
- 監査記録がない記事をユーザーが個別承認した場合だけuser_approved:trueを使える。
- 通常はis_publish:true。「下書きだけ」はfalse。「投稿しない」「ローカルのみ」と無人実行はMCPを呼ばず停止する。
- 既存noteを持つ本文は新規投稿しない。復旧時だけ[復旧メモ](references/eyecatch-recovery.md)を読む。

## アイキャッチ

完成済み画像がなければagent_type:eyecatch-generator、fork_turns:noneへ
表示タイトル・KICKER・雰囲気・drafts/images内の出力先を渡す。
返却PNGが1280×670pxであることを確認する。画像担当が文字・構図を目視検品する。
<!-- 品質維持：画像の必須添付・目視検品は計数やアップロード成功判定では代替しない。 -->

## 実行

1. `node scripts/check_article.mjs <本文パス>` の最終結果と監査反映を確認する。未確定タグは解消する。
2. note_session_statusを呼ぶ。未起動・未認証時だけopen_note_loginを呼ぶ。
3. loggedIn:trueなら続行。それ以外は本人の手動ログインを待ちstatusを再確認する。
4. publish_noteへdraft_path、eyecatch_path、is_publish、根拠のあるhashtagsを渡す。有料記事のみpriceを指定する。
5. 本公開はverification.published:trueとverification.eyecatchUrlを確認する。
   note下書きはverification.saved:trueと画像URLを確認する。検証不明は完了にしない。
6. state・アーカイブ更新はMCP担当。URLと検証結果を報告する。

## 失敗時

- 投稿開始後のエラーやdoNotRetry:trueでは再投稿しない。note ID/key、エラー、ローカル記録を報告する。
- articles/publication-attempts/は再投稿防止記録。結果不明の記録を自動削除しない。
- ログインや入力形式など外部書き込み前の失敗だけ原因解消後に再実行できる。
- 公開成功・ローカル保存失敗も再投稿しない。URLを保持し障害として報告する。
- MCPは3ツールのまま。削除・公開取り消し・既存記事更新を別経路で自動実行しない。
