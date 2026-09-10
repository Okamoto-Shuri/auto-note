---
name: note-article-seo-draft
description: 1本または明示された複数のnote記事を、調査・SEO設計・執筆・独立監査し、指定に応じ投稿へ引き継ぐ。新規記事と既存記事のリライトに使う。
---

# note-article-seo-draft

## 開始時

1. ルートのdocs/editorial-policy.md、docs/note-format.md、articles/state.jsonをまとめて読む。
2. 新規記事では[writing.md](references/writing.md)、リライトでは[rewrite.md](references/rewrite.md)を読む。
3. 専任agentの詳細は各.codex/agents/*.tomlを正本とする。親が通常実行で読み直さない。
4. 下記の「件数と実行単位」で単発かバッチかを決める。各記事の本文・briefの保存先を分け、工程別時刻・呼び出し数をそれぞれのbriefへ記録する。

## 件数と実行単位

- 件数指定がない依頼と「1本」は単発モードにする。従来どおり勝手に複数化しない。
- 複数テーマの列挙、「N本」、backlogの複数選択が明示された場合だけバッチモードにする。
- 件数だけ指定された場合はtopic_backlogの先頭から重複なく必要数を選ぶ。不足分のテーマを勝手に作らず、開始前に一度だけテーマ指定またはnote-topic-ideasによる補充可否を確認する。
- バッチ開始前に対象テーマ、順序、各記事の個別指定、投稿方法を短く整理する。共通の要件確認は一度にまとめ、記事固有の値は各briefへ分けて残す。
- 1記事ごとにPhase 0〜7と最終チェックを完了してから次の記事へ進む。異なる記事の工程を混在させず、専任agentは常に1つずつ呼ぶ。
- 記事固有の失敗は、その記事を未完了として記録したうえで、安全に独立して進められる後続記事は継続する。共有stateの破損、投稿結果不明、認証待ちなど後続へ影響する失敗ではバッチを停止する。

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
本文の確定後、記事ごとにagent_type:article-visual-generator、fork_turns:noneへ本文パスとbriefの画像仕様2〜3件を渡す。
返却された全画像を目視検品し、説明対象の近くへalt付きMarkdownで挿入する。画像生成と検品が完了するまで記事を完成扱いにしない。
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
- バッチでもstate更新は監査・最終チェックを完了した記事ごとに行う。全件完了まで遅延させず、未完了記事をdraftsやtopic_historyへ入れない。
- 「ローカルのみ」「投稿しない」と無人実行はここで停止する。
- その他は記事ごとにnote-article-publishへ本文パスを渡し、通常はnote下書きに保存して停止する。「本公開」が明示された記事だけ本公開する。
- 複数記事を投稿する場合も1本ずつ保存状態と画像URLを検証してから次へ進む。結果不明・部分成功・doNotRetry:trueでは後続投稿を停止し、同じ記事を再投稿しない。
- 投稿後のstate更新・本文移動は重複実行しない。

## 最終報告

公開/下書きURLまたは停止理由、本文・briefのパス、本文総字数と章別差分、
本文画像2〜3枚のパス・alt・挿入先、監査指摘と修正、仮定と根拠、未確定タグ一覧（0件ならなし）を報告する。
バッチでは記事ごとに上記を分け、完了・未完了・未着手の件数と停止理由を先に要約する。
