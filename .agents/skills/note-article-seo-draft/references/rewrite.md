# 既存記事リライト

1. 対象のdrafts/published本文を読み、編集方針を適用する。元記事を自動上書きしない。
2. seo-researcherへKW/SUB_KW/PERSONAを渡しPhase 1を実行する。
3. 完了後、seo-plannerへPhase 1結果と元記事・共通変数を渡す。Phase 2のみ依頼し、Phase 3は省く。
4. 完了後、seo-auditorへ元記事のパス・NG・EEATを渡しPhase 7を実行する。
5. 分析と具体的な修正前→修正後を報告する。保存・反映・再公開は追加依頼まで行わない。

各agentはfork_turns:noneで順番に起動する。反映依頼があれば承認箇所だけ編集する。
公開済み記事・note既存下書きはpublish_noteで新規作成しない。
既存noteの更新は現行MCP対象外のため、noteエディタでの手動反映を案内する。
