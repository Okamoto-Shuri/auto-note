---
name: note-article-publish
description: 監査済みnote記事を必須アイキャッチ付きで既定は下書き保存し、明示された場合だけ本公開して保存状態と画像を検証する。
---

# note-article-publish

## 入力と条件

- 対象はdrafts内の本文1本。seo-briefは投稿しない。ルートのdocs/note-format.mdを読む。
- 本文には実在するローカル画像が2〜3枚必要。空alt、重複参照、リモート/data URLを含む記事は保存・公開しない。
- 本公開には同名briefのPhase 7に「指摘事項なし」または「反映済み」が必要。
- 監査記録がない記事をユーザーが個別承認した場合だけuser_approved:trueを使える。
- 通常はis_publish:falseでnote下書きに保存する。ユーザーが「本公開」を明示した場合だけtrueにする。「投稿しない」「ローカルのみ」と無人実行はMCPを呼ばず停止する。
- 既存noteを持つ本文は新規投稿しない。復旧時だけ[復旧メモ](references/eyecatch-recovery.md)を読む。

## アイキャッチ

完成済み画像がなければagent_type:eyecatch-generator、fork_turns:noneへ
表示タイトル・KICKER・雰囲気・drafts/images内の出力先を渡す。
返却PNGが1280×670pxであることを確認する。画像担当が文字・構図を目視検品する。
<!-- 品質維持：画像の必須添付・目視検品は計数やアップロード成功判定では代替しない。 -->

## 実行

1. `node scripts/check_article.mjs <本文パス>` の最終結果、本文画像2〜3枚の実在、監査反映を確認する。未確定タグは解消する。
2. note_session_statusを呼ぶ。未起動・未認証時だけopen_note_loginを呼ぶ。
3. loggedIn:trueなら続行。それ以外は本人の手動ログインを待ちstatusを再確認する。
4. publish_noteへdraft_path、eyecatch_path、is_publish:false、根拠のあるhashtagsを渡す。本公開が明示された場合だけis_publish:trueにし、有料記事のみpriceを指定する。
5. 本文画像がすべてアップロード対象へ解決されたことを確認する。本公開はverification.published:trueとverification.eyecatchUrlを確認する。
   note下書きはverification.saved:trueと画像URLを確認する。検証不明は完了にしない。
6. state・アーカイブ更新はMCP担当。URLと検証結果を報告する。

## 失敗時

- 投稿開始後のエラーやdoNotRetry:trueでは再投稿しない。note ID/key、エラー、ローカル記録を報告する。
- articles/publication-attempts/は再投稿防止記録。結果不明の記録を自動削除しない。
- ログインや入力形式など外部書き込み前の失敗だけ原因解消後に再実行できる。
- 公開成功・ローカル保存失敗も再投稿しない。URLを保持し障害として報告する。
- MCPは3ツールのまま。削除・公開取り消し・既存記事更新を別経路で自動実行しない。
