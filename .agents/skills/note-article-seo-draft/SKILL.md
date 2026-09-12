---
name: note-article-seo-draft
description: 1本または明示された複数のnote記事を、調査・SEO設計・執筆・独立監査し、指定に応じ投稿へ引き継ぐ。新規記事と既存記事のリライトに使う。
---

# note-article-seo-draft

## 開始時

1. `node scripts/article_run_artifacts.mjs start`を実行し、返却されたmanifestパスをこの作業の終了まで保持する。
2. ルートのdocs/editorial-policy.md、docs/note-format.md、articles/state.jsonをまとめて読む。
3. 新規記事では[writing.md](references/writing.md)、リライトでは[rewrite.md](references/rewrite.md)を読む。
4. 専任agentの詳細は各.codex/agents/*.tomlを正本とする。親が通常実行で読み直さない。
5. 下記の「件数と実行単位」で単発かバッチかを決める。各記事の本文・briefの保存先を分け、工程別時刻・呼び出し数をそれぞれのbriefへ記録する。

## 作業ファイルの所有管理

- この作業で`articles/`内へ新規作成したMarkdownと画像は、作成直後に`node scripts/article_run_artifacts.mjs register <manifest> <path...>`で登録する。本文、brief、本文画像、アイキャッチ、投稿時に生じた公開用Markdownを含む。
- 開始前から存在したファイルは登録・上書き・削除しない。別作業が同時に作った未登録差分も削除しない。
- 全記事の監査、投稿またはローカル完了処理、state更新、検証が終わった後、`status <manifest>`で未登録差分を確認する。今回の作業ファイルなら登録し、無関係な差分は触らない。その後、最終報告の直前に`cleanup <manifest>`を1回実行して削除結果を確認する。
- 投稿結果不明、部分成功、state更新失敗など復旧が必要な間は作業未完了とし、manifestとローカル成果物を保持する。状態を確定してから後処理する。

## 件数と実行単位

- 件数指定がない依頼と「1本」は単発モードにする。従来どおり勝手に複数化しない。
- 複数テーマの列挙、「N本」、backlogの複数選択が明示された場合だけバッチモードにする。
- 件数だけ指定された場合はtopic_backlogの先頭から重複なく必要数を選ぶ。不足分のテーマを勝手に作らず、開始前に一度だけテーマ指定またはnote-topic-ideasによる補充可否を確認する。
- バッチ開始前に対象テーマ、順序、各記事の個別指定、投稿方法を短く整理する。共通の要件確認は一度にまとめ、記事固有の値は各briefへ分けて残す。
- バッチは工程ごとの波で進める。Phase 1、Phase 2〜3、画像生成、Phase 7は対象記事分を同時に呼び、波の全記事が揃ってから次の波へ進む。
- 1記事内の順序は変えない。調査→設計→執筆→独立監査を飛ばさず、ある記事のPhaseを同記事の前工程の完了前に始めない。
- 同時実行する専任agentへは、記事ごとに独立した入力とbrief保存先だけを渡す。ある記事のPhase 1結果を別記事のagentへ混ぜない。
- artifact manifestの登録とstate.jsonの更新は親だけが行う。並列の波では、各agentの返却を受け取った親が順に登録する。registerはmanifestを読んで書き戻すため、同時呼び出しで登録が失われる。専任agentへregisterとstate更新を委譲しない。
- 記事固有の失敗は、その記事を未完了として記録したうえで、安全に独立して進められる後続記事は継続する。共有stateの破損、投稿結果不明、認証待ちなど後続へ影響する失敗ではバッチを停止する。

## Phase 0：要件

編集方針からKW/SUB_KW/PERSONA/GOAL/MEDIA/EEAT/INTERNAL/NG/MIN_CHAR/MAX_CHARを確定する。
提供SERPは優先する。重要な未指定事項だけ質問し、仮定と根拠をbriefへ記録する。

## Phase 1：調査

agent_type:seo-researcher、fork_turns:noneでKW/SUB_KW/PERSONA/SERPを渡す。
バッチでは対象記事分のresearcherを同時に呼ぶ。
結果の検索意図・ギャップ・出典を、数値の単位・対象・日時・前提を落とさずbriefへ保存する。

## Phase 2〜3：差別化・構成

各記事のresearcher完了後にagent_type:seo-planner、fork_turns:noneを使う。
バッチでは全記事のPhase 1が揃った時点でplannerを同時に呼ぶ。
Phase 1の結果とKW/SUB_KW/EEAT/MEDIA/GOAL/INTERNAL/MIN_CHAR/MAX_CHARを渡す。
差別化3案の比較・推奨理由・クラスター・エンティティ・全見出しと配分をbriefへ保存する。
導入・FAQ・まとめを含む合計を確認してから執筆する。

## Phase 4〜6：執筆

親がwriting.mdに従いタイトルからFAQ・CTAまで通して執筆する。
タイトル確定直後に、記事ごとのagent_type:eyecatch-generator、fork_turns:noneをまとめて起動し、執筆と並行させる。表示タイトル・KICKER・雰囲気・drafts/images内の出力先を渡す。返却PNGは投稿時まで保持する。
画像仕様はPhase 3で確定しているため、agent_type:article-visual-generator、fork_turns:noneも執筆と並行して起動してよい。本文パスと画像仕様2〜3件を渡し、本文が未確定な章では構成と要点を仕様へ添える。
返却された全画像を目視検品し、挿入前に確定本文との整合を必ず確認する。ずれがあれば該当画像だけ再生成し、説明対象の近くへalt付きMarkdownで挿入する。画像生成と検品が完了するまで記事を完成扱いにしない。
本文・briefを保存し、note-format.mdの一括チェックで計数・目次位置・形式の指摘をまとめて修正する。
各章の実測と配分差、未確定タグ残数、全章完了・本文総字数をbriefへ記録する。
<!-- 品質維持：10タイトル比較・3メタ・JSON-LDも残す。note非対応でも勝手に省略しない。 -->

## Phase 7：独立監査

監査へ渡す前に`node scripts/check_article.mjs <本文パス>`を通し、計数・目次位置・形式・未確定タグの機械的な指摘を解消する。監査の往復を機械的な指摘で消費しない。
agent_type:seo-auditor、fork_turns:noneへ完成本文のパス、NG、EEATだけを渡す。
バッチでは全記事の本文とcheck_article通過が揃った時点でauditorを同時に呼ぶ。
<!-- 品質維持：独立性のため、執筆時の判断過程や「正しいはず」という結論を渡さない。 -->
具体的修正をすべて反映し、briefのPhase 7に結果・反映箇所を記録する。採点・定例の再監査ループは行わない。
最終版を一括チェックし直す。内容上の疑義が残れば解消するまで公開しない。

## 保存・投稿

- state.draftsへfile/title/kw/created_atを追加する。同じfileは重複追加しない。後処理完了時は削除済みパスを残さずfile:nullにする。
- 採用トピックをbacklogからtopic_historyへtopic_id/kw/title/atとともに移す。直接指定テーマも履歴へ残す。
- バッチでもstate更新は監査・最終チェックを完了した記事ごとに行う。全件完了まで遅延させず、未完了記事をdraftsやtopic_historyへ入れない。
- 「ローカルのみ」「投稿しない」と無人実行はMCPを呼ばず、state更新と検証後に作業ファイルを削除して停止する。
- その他は記事ごとにnote-article-publishへ本文パスとPhase 4で生成済みのアイキャッチパスを渡し、通常はnote下書きに保存して停止する。「本公開」が明示された記事だけ本公開する。
- 複数記事を投稿する場合も1本ずつ保存状態と画像URLを検証してから次へ進む。結果不明・部分成功・doNotRetry:trueでは後続投稿を停止し、同じ記事を再投稿しない。
- 投稿後のstate更新・作業ファイル削除は重複実行しない。

## 最終報告

公開/下書きURLまたは停止理由、削除した本文・brief・画像のパス、本文総字数と章別差分、
本文画像2〜3枚のalt・挿入先、監査指摘と修正、仮定と根拠、未確定タグ一覧（0件ならなし）を報告する。
バッチでは記事ごとに上記を分け、完了・未完了・未着手の件数と停止理由を先に要約する。
