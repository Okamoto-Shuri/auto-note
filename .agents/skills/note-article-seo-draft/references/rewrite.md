# 既存記事リライト

1. 対象のdrafts/published本文を読み、編集方針を適用する。元記事を自動上書きしない。
2. seo-researcherへKW/SUB_KW/PERSONAを渡しPhase 1を実行する。
3. 完了後、seo-plannerへPhase 1結果と元記事・共通変数を渡す。Phase 2のみ依頼し、Phase 3は省く。
4. 完了後、seo-auditorへ元記事のパス・NG・EEATを渡しPhase 7を実行する。
5. 分析と具体的な修正前→修正後を報告する。保存・反映・再公開は追加依頼まで行わない。

各agentはfork_turns:noneで順番に起動する。反映依頼があればarticle-writerをfork_turns:none、MODE:reviseで呼び、元記事・確定したPhase 1〜2結果・共通変数・具体的な修正指示・承認範囲・保存先・残り修正回数を渡す。Phase 3は省略した旨を明示し、承認箇所だけ編集させる。元記事の上書きが承認されていなければ親が新しい保存先を指定する。
反映後は親が本文画像2〜3枚とアイキャッチを専任agentへ新規生成依頼し、目視検品・挿入・一括チェック・完成本文の独立監査を行う。brief・manifest・stateは親だけが更新し、修正・再検証と修正・再監査は各3往復までとする。
公開済み記事・note既存下書きはpublish_noteで新規作成しない。
既存noteの更新は現行MCP対象外のため、noteエディタでの手動反映を案内する。
