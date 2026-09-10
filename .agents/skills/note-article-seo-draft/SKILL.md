---
name: note-article-seo-draft
description: note記事を調査・SEO設計・執筆・独立監査し、指定に応じ投稿へ引き継ぐ。新規記事と既存記事のリライトに使う。
---

# note-article-seo-draft

## 開始時

1. ルートのdocs/editorial-policy.md、docs/note-format.md、articles/state.jsonをまとめて読む。
2. 新規記事では[writing.md](references/writing.md)、リライトでは[rewrite.md](references/rewrite.md)を読む。
3. 専任agentの詳細は各.codex/agents/*.tomlを正本とする。親が通常実行で読み直さない。
4. 1回につき1記事。本文・briefの保存先を決め、工程別時刻・呼び出し数をbriefへ記録する。

## Phase 0：要件

編集方針からKW/SUB_KW/PERSONA/GOAL/MEDIA/EEAT/INTERNAL/NG/MIN_CHAR/MAX_CHARを確定する。
提供SERPは優先する。重要な未指定事項だけ質問し、仮定と根拠をbriefへ記録する。

## Phase 1：調査

agent_type:seo-researcher、fork_turns:noneでKW/SUB_KW/PERSONA/SERPを渡す。
結果の検索意図・ギャップ・出典を、数値の単位・対象・日時・前提を落とさずbriefへ保存する。

## Phase 2〜3：差別化・構成

researcher完了後にagent_type:seo-planner、fork_turns:noneを使う。
Phase 1の結果とKW/SUB_KW/EEAT/MEDIA/GOAL/INTERNAL/MIN_CHAR/MAX_CHARを渡す。
差別化3案の比較・推奨理由・クラスター・エンティティ・全見出しと配分をbriefへ保存する。
導入・FAQ・まとめを含む合計を確認してから執筆する。

## Phase 4〜6：執筆

親がwriting.mdに従いタイトルからFAQ・CTAまで通して執筆する。
本文・briefを保存し、note-format.mdの一括チェックで計数・形式の指摘をまとめて修正する。
各章の実測と配分差、未確定タグ残数、全章完了・本文総字数をbriefへ記録する。
<!-- 品質維持：10タイトル比較・3メタ・JSON-LDも残す。note非対応でも勝手に省略しない。 -->

## Phase 7：独立監査

agent_type:seo-auditor、fork_turns:noneへ完成本文のパス、NG、EEATだけを渡す。
<!-- 品質維持：独立性のため、執筆時の判断過程や「正しいはず」という結論を渡さない。 -->
具体的修正をすべて反映し、briefのPhase 7に結果・反映箇所を記録する。採点・定例の再監査ループは行わない。
最終版を一括チェックし直す。内容上の疑義が残れば解消するまで公開しない。

## 保存・投稿

- state.draftsへfile/title/kw/created_atを追加する。同じfileは重複追加しない。
- 採用トピックをbacklogからtopic_historyへtopic_id/kw/title/atとともに移す。直接指定テーマも履歴へ残す。
- 「ローカルのみ」「投稿しない」と無人実行はここで停止する。
- その他はnote-article-publishへ本文パスを渡す。通常は本公開、「下書きだけ」はnote下書き。
- 投稿後のstate更新・本文移動は重複実行しない。

## 最終報告

公開/下書きURLまたは停止理由、本文・briefのパス、本文総字数と章別差分、
監査指摘と修正、仮定と根拠、未確定タグ一覧（0件ならなし）を報告する。
