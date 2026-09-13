# auto-note

現状の記事作成は、親エージェントが全工程を統制し、調査・SEO設計・本文執筆・画像生成・監査を6種類の専任エージェントへ委譲する仕組みです。

## 1. 全体の構造

標準的な新規記事は、次の順序で作られます。

```text
ユーザー依頼／topic_backlog
        ↓
Phase 0 要件確定
        ↓
Phase 1 検索意図・競合調査
        ↓
Phase 2 差別化設計
        ↓
Phase 3 記事構成設計
        ↓
Phase 4 タイトル・導入
        ↓
Phase 5 本文執筆
        ↓
Phase 6 FAQ・画像・リンク・CTA
        ↓
機械検証 check_article.mjs
        ↓
Phase 7 独立監査
        ↓
修正・最終検証
        ↓
note下書き保存／本公開／ローカル保存
        ↓
state更新・manifest終了処理・最終報告
```

重要なのは、1記事内では必ず「調査→設計→執筆→独立監査」の順番を守ることです。調査結果が出る前に設計を始めたり、構成確定前に本文を書いたりはしません。

正本は[note-article-seo-draft](.agents/skills/note-article-seo-draft/SKILL.md)です。

## 2. 親エージェントの役割

親エージェントは、単なる進行係ではありません。記事作成における中心的な実行主体です。

担当する仕事は次のとおりです。

- ユーザー依頼の解釈
- 単発／バッチの判定
- artifact manifestの作成
- 編集方針・本文形式・stateの読み込み
- Phase 0の要件確定
- 専任エージェントの起動と入出力管理
- article-writerへの執筆依頼と本文の確認
- 専任エージェント結果のbriefへの保存
- 画像の本文への挿入
- 機械検証
- article-writerへの監査指摘の修正依頼と反映確認
- `articles/state.json`の更新管理
- note投稿スキルへの引き渡し
- 作業ファイルの登録・保全・削除
- 最終報告

本文の執筆・文章修正は`article-writer`が担当します。`seo-planner`は構成、`seo-auditor`は独立した指摘を担当し、親が画像挿入・最終検証・記録を管理します。

また、manifest登録とstate更新を専任エージェントへ委譲してはいけません。複数エージェントが同時更新すると、登録内容が失われる可能性があるためです。

## 3. 使用するスキル

### note-article-seo-draft

記事作成全体のオーケストレーションを行う中心スキルです。

対象：

- 新規記事
- 明示された複数記事
- 既存記事のリライト分析
- 監査後の投稿スキルへの引き渡し

主な入力：

- ユーザーが指定したテーマ
- 記事数
- 本公開／下書き／ローカルのみなどの保存方法
- 任意の検索キーワード
- 任意の読者像、目的、禁止表現
- 任意のSERP情報
- `articles/state.json`のbacklog、公開済み記事、下書き情報
- 編集方針と本文形式

主な出力：

- `articles/drafts/<slug>.md`
- `articles/drafts/<slug>.seo-brief.md`
- 本文画像2〜3枚
- アイキャッチ1枚
- 機械検証結果
- 独立監査結果
- note下書き／公開URL、またはローカル成果物
- 更新されたstate
- 作業結果の詳細報告

仕様：[note-article-seo-draft](.agents/skills/note-article-seo-draft/SKILL.md)

### note-topic-ideas

記事ネタを補充するスキルです。記事本文は作りません。

入力：

- 指定分野。未指定なら既存メディア方針
- `articles/state.json`
- 編集方針
- 任意の追加件数・backlog上限

処理：

- 具体的で1記事に成立するテーマを3〜5件考える
- `topic_history`と`topic_backlog`の重複・酷似を除外
- 既定ではbacklogを5件以内に保つ

出力：

```json
{
  "id": "<slug>",
  "title": "<仮タイトル>",
  "note": "<補足>",
  "added_at": "<ISO8601>"
}
```

これを`articles/state.json`の`topic_backlog`へ追加し、追加内容を報告します。

仕様：[note-topic-ideas](.agents/skills/note-topic-ideas/SKILL.md)

### note-article-publish

監査済み記事を本人のnoteへ保存するスキルです。

入力：

- `articles/drafts`内の本文Markdown 1本
- 1280×670pxのアイキャッチ
- 引き継いだartifact manifest
- 下書き／本公開の指定
- 根拠のあるhashtags
- 有料記事の場合のみprice
- 必要ならmagazine keys

出力：

- note記事ID
- note key
- 下書き編集URLまたは公開URL
- 保存状態
- 公開状態
- アイキャッチURL
- 検証日時
- publication-attempt記録
- 更新された`articles/state.json`

通常は下書き保存です。「本公開」が明示されたときだけ本公開します。

仕様：[note-article-publish](.agents/skills/note-article-publish/SKILL.md)

## 4. Phase 0：要件確定

### 入力

ユーザー指定と編集方針から、次の変数を確定します。

- `KW`：主キーワード
- `SUB_KW`：関連キーワード
- `PERSONA`：読者像
- `GOAL`：記事の目的
- `MEDIA`：媒体方針
- `EEAT`：利用可能な経験・専門性
- `INTERNAL`：内部リンク候補
- `NG`：禁止表現・禁止事項
- `MIN_CHAR`
- `MAX_CHAR`

既定値は次のようになっています。

- MEDIA：専門外の読者にも分かる、親しみやすい日本語解説note
- PERSONA：テーマに関心のある一般読者
- GOAL：閲覧、スキ、フォロー獲得
- EEAT：本人の一次体験なし
- 文字数：4,000〜6,000字
- KW：依頼テーマを優先し、なければbacklog先頭

内部リンク候補は、`state.published`にある既存記事のタイトルとnote URLから関連するものだけを取得します。

不足事項があっても、固定済みの文体や文字数を毎回質問しません。記事の結果を大きく変える重要事項だけ確認し、それ以外は合理的に仮定して、理由とともにbriefへ残します。

詳細：[編集方針](docs/editorial-policy.md)

### 出力

記事ごとのSEO briefに、以下を保存します。

- 確定した全変数
- ユーザーへの質問と回答
- 親が置いた仮定
- 仮定の根拠
- Phase 0の開始・終了時刻
- 呼び出し数

## 5. Phase 1：seo-researcher

調査専任の読み取り専用エージェントです。

定義：[seo-researcher.toml](.codex/agents/seo-researcher.toml)

### 入力

```text
KW
SUB_KW
PERSONA
任意のSERP情報
```

提供されたSERPがある場合は、それを優先します。

### 処理

- 原則1回の検索
- 公式、公的機関、大手専門メディアなど最大3サイト程度を確認
- Know／Do／Buy／Goの主検索意図を判定
- マイクロインテントを4〜6個抽出
- 上位記事の共通トピックを分析
- 上位記事だけが扱う論点を分析
- 主流のコンテンツ形式を確認
- コンテンツギャップを5個以上抽出
- 次に調べる検索語を3つ提示
- 数値、対象期間、単位、前提を整理
- 未取得・判定不能を明記

検索結果を確認できなかった場合、上位記事の内容や平均文字数を推測で作りません。「判定不能」とします。

### 出力

```text
検索意図
マイクロインテント
上位構造
共通トピック
上位固有の論点
主流形式
ギャップ5件以上
次の検索語3件
出典付き主張
未取得事項
開始・終了時刻
検索・取得呼び出し数
```

各出典には、必要に応じて次が付きます。

- URL
- 資料名
- 公表日
- 確認日時
- 対象期間
- 単位
- 対象範囲
- 前提
- 事実／試算／推定の区分

この結果を親が記事別briefのPhase 1へ保存します。

## 6. Phase 2〜3：seo-planner

差別化と構成設計専任の読み取り専用エージェントです。

定義：[seo-planner.toml](.codex/agents/seo-planner.toml)

### 入力

```text
Phase 1の全結果
KW
SUB_KW
EEAT
MEDIA
GOAL
INTERNAL
MIN_CHAR
MAX_CHAR
```

### Phase 2の処理

検索結果のギャップから差別化案を3つ作ります。

各案を次の3軸、各5点で比較します。

- 独自性
- 検索意図との一致
- 実現性

さらに、

- 推奨案と推奨理由
- 必要な公開資料
- 素材がなくても成立するか
- ピラー記事かクラスター記事か
- 内部リンク候補
- 将来の関連記事3件
- 必須・推奨エンティティ15語以上

を返します。

本人の体験や実績が必要な案は、一次情報がないため推奨しません。

### Phase 3の処理

新規記事の場合は、実際に執筆できるレベルまでアウトラインを設計します。

- リード：120〜160字
- 導入：350〜450字
- 本論H2：5〜7本
- 各H2内のH3：2〜4本
- FAQ：4〜6問
- FAQ回答：各80〜120字
- まとめ、CTA
- 合計4,000〜6,000字
- 目標：約5,200字

各見出しには以下が付きます。

- 見出しの役割
- 予定字数
- 対応する検索意図
- 使用するエンティティ
- 狙うSERPフィーチャー
- 章の入口となる問いや具体例
- 理解を助ける具体化
- 図解・画像案

本文画像として実装する2〜3案については、さらに次を定義します。

```text
挿入する見出し
伝える要点
画像形式
構図
必要な短いラベル
避ける表現
alt
ファイル名
```

### 出力

- 差別化3案と採点
- 推奨案と理由
- 素材要否
- トピッククラスター
- 内部リンク案
- エンティティ一覧
- 全見出し
- 各章の予定字数
- 本文画像2〜3枚の仕様
- 記事全体の論理確認
- 開始・終了時刻と呼び出し数

この出力が確定してから執筆が始まります。

## 7. Phase 4〜6：article-writer

定義：[article-writer.toml](.codex/agents/article-writer.toml)

確定したPhase 0〜3の要件・調査・出典・構成・画像仕様と、記事固有の本文保存先を渡します。まず`MODE:title`でPhase 4を受け取り、親がタイトルを確定したら同じwriterへ`MODE:body`でPhase 5〜6を依頼します。画像生成は親が専任エージェントへ依頼し、本文執筆と並行できます。

writerが編集するのは割り当てられた本文だけです。brief用の記録は返答で渡し、親が保存します。検証や監査で本文修正が必要な場合は`MODE:revise`で具体的指摘と残り修正回数を渡します。writerの完了後に親が画像挿入・再検証を行い、同じ本文を同時編集しません。

執筆ルールの正本は[writing.md](.agents/skills/note-article-seo-draft/references/writing.md)です。

### Phase 4：タイトルと導入

article-writerがタイトル候補を10案作ります。

タイトルの型：

- 理論反証
- 逆説
- 前提反転
- 因果反転
- 直球

制約：

- 28〜32字
- 理論反証を2案以上
- 逆説を2案以上
- 全体で3型以上
- 直球は最大2案
- 採用タイトルは直球以外
- KWは原則として先頭15字以内
- 本文のどのH2で主張を回収するか明記

各候補を次の5軸、各5点で採点します。

- 検索意図一致
- 論題の鋭さ
- 好奇心ギャップ
- 本文回収可能性
- 非誇大

メタディスクリプションは3案、それぞれ120〜140字で作り、briefだけに保存します。

本文冒頭は以下の構造です。

```text
リード 120〜160字
導入 350〜450字
<toc>
最初のH2
```

`<toc>`は単独行で1回だけ必要です。

### Phase 5：本文

article-writerがplannerの配分に従って、記事全体を一度に執筆します。

記事構造：

- リード
- 導入
- 本論H2 5〜7本
- 各H2のH3 2〜4本
- よくある質問
- まとめ
- 中盤CTA
- 末尾CTA

基本的な論理順序：

```text
読者の疑問
→ 結論
→ 根拠
→ 読者への適用
→ 次の行動
```

各章はPREPを基本とし、問い、意外な事実、具体例、たとえなど、理解や興味を進める工夫を最低1つ入れます。

主な文体制約：

- 一文60字以内を目安
- 漢字比率30％前後
- 同一文末を3回連続させない
- 1段落2〜4文
- 過剰な敬語、官僚的表現を避ける
- 根拠のない逸話や誇張を使わない
- 表は使わない
- 箇条書きは1章1箇所まで
- 専門語は初出で言い換える
- 本人の実績や体験を作らない

### Phase 6：FAQ・リンク・画像・CTA

FAQは4〜6問、各回答80〜120字です。

JSON-LDは次から適切なものを作ります。

- Article
- HowTo
- FAQPage
- BreadcrumbList

ただしJSON-LDは本文へ入れず、briefへ保存します。FAQPageの場合は本文の質問・回答と完全に一致させます。

内部リンクはplannerが選んだ既存記事だけを使用し、候補がなければ無理に追加しません。

## 8. article-visual-generator

本文画像専任エージェントです。

定義：[article-visual-generator.toml](.codex/agents/article-visual-generator.toml)

### 入力

```text
ARTICLE_PATH
VISUAL_SPECS 2〜3件
```

各`VISUAL_SPEC`には以下を含めます。

- 挿入位置
- 伝える要点
- 画像形式
- 構図
- 短いラベル
- 避ける表現
- alt
- OUTPUT_PATH

### 処理

- 本文の該当箇所を読む
- 画像同士が重複しないことを確認
- 各画像を別々のプロンプト・別々の呼び出しで生成
- 概念図、比較図、手順図、関係図を優先
- 本文にない数値や主張を追加しない
- ロゴ、透かし、架空データを入れない
- 日本語文字が不正確なら文字なしで再生成
- 必要なら正確な短いラベルだけを後から重ねる
- 各画像を目視検品
- 問題画像だけ最大2回再生成
- `articles/drafts/images`へ保存
- 既存画像を上書きしない

### 出力

```text
各画像の絶対パス
対応するalt
目視検品結果
生成できなかった場合の理由
```

本文やbriefは編集しません。note投稿もしません。

返却後、親が確定本文との整合をもう一度確認し、次の形式で該当段落の近くへ挿入します。

```markdown
![画像の内容と役割を表すalt](images/<slug>-body-01.png)
```

## 9. eyecatch-generator

アイキャッチ専任エージェントです。

定義：[eyecatch-generator.toml](.codex/agents/eyecatch-generator.toml)

### 入力

必須：

```text
TITLE
KICKER
MOOD
OUTPUT_PATH
```

任意：

```text
TEMPLATE
TONE
```

### テンプレート選択

雰囲気に応じて参考HTMLを1つだけ選びます。

- vermilion：速報、強いインパクト
- indigo：政策、知的、冷静
- emerald：実践、学習、成長
- violet：創造、未来、思想
- amber：入門、親しみ、実利
- cyan：テック、情報整理

HTMLは視覚的な参考資料にすぎません。HTMLをレンダリングしたり、文言だけ置換したり、スクリーンショットを撮ったりすることは禁止されています。

### 処理

- TITLEを自然な2段へ分割
- TITLEとKICKERの文字列は変更しない
- image generationで一から生成
- 余計な文字、ロゴ、透かしを禁止
- 文字、構図、可読性を目視検品
- 最大2回まで再生成
- 歪ませず中央基準でクロップ
- 1280×670pxへ仕上げ
- PNGとして`drafts/images`へ保存
- ファイル形式と寸法を確認

### 出力

最終PNGの絶対パスだけです。

アイキャッチ生成は、タイトル確定後に本文執筆と並行して動かせます。

## 10. 機械検証：check_article.mjs

本文と同名briefを読み、形式・文字数・画像・briefの整合を検証します。

実装：[check_article.mjs](scripts/check_article.mjs)

### 入力

```bash
node scripts/check_article.mjs articles/drafts/<slug>.md
```

同名の`<slug>.seo-brief.md`も自動的に読み込みます。

### 主な検証項目

- frontmatterの存在
- `status: draft`
- 本文4,000〜6,000字
- タイトル28〜32字
- リード120〜160字
- 導入350〜450字
- 本論H2が5〜7本
- 各本論H2のH3が2〜4本
- FAQが4〜6問
- FAQ回答が各80〜120字
- `<toc>`が正しい位置に1回
- 本文画像が2〜3枚
- 画像altが空でない
- 画像参照が重複していない
- リモート画像やdata URLを使っていない
- 画像ファイルが実在する
- 画像が`articles/drafts`内にある
- H2／H3以外の不正な見出しがない
- 見出し前後に空行がある
- Markdown表がない
- コードフェンスが閉じている
- 未確定タグが残っていない
- タイトル候補が10案ある
- 採用タイトルが10案に含まれる
- タイトル型の構成が条件を満たす
- 各候補の採点合計が正しい
- 回収先H2が実在する
- メタ候補が3案ある
- 各メタが120〜140字
- briefのFAQ数が本文と一致する
- 各章の予定字数がbriefにある
- JSON-LDを解析できる
- FAQPageと本文FAQが一致する
- Phase 7記録があるか

### 出力

JSONで返します。

```json
{
  "ok": true,
  "errors": [],
  "metrics": {
    "titleChars": 30,
    "bodyChars": 5200,
    "leadChars": 140,
    "introChars": 400,
    "mainH2": 6,
    "faqCount": 5,
    "bodyImageCount": 3,
    "chapters": [],
    "unresolvedTags": [],
    "auditRecorded": true
  },
  "manualChecks": []
}
```

ただし、これは事実確認や文体判断の代替ではありません。機械で判断できないものはPhase 7と親の確認に残されます。

修正と再チェックの往復は最大3回です。

## 11. Phase 7：seo-auditor

完成記事を執筆者とは別の立場で検証する、読み取り専用エージェントです。

定義：[seo-auditor.toml](.codex/agents/seo-auditor.toml)

### 入力

意図的に入力を絞っています。

```text
完成本文のファイルパス
NG
EEAT
```

plannerの判断過程や、「この内容は正しいはず」という執筆側の結論は渡しません。監査の独立性を守るためです。

### 検査内容

- 数値
- 固有名詞
- 年号
- 政策
- 製品情報
- 出典との整合
- ％と％ポイントの区別
- 対象範囲
- 対象期間
- 比較起点
- 試算の前提
- 本人の実績・体験の捏造
- 根拠のない断定
- 最上級
- NG表現
- 未確定タグ
- 本文画像の枚数
- altと周辺本文の整合
- 画像内の未確認数値や固有名詞

重大な疑義については、必要な原資料や最新情報を確認します。ただし、Phase 1を最初からやり直すような広範な再調査は行いません。

### 出力

```markdown
## ファクトチェック結果

状況：指摘事項なし / 修正指示あり
総評：...

## 修正指示

理由
修正前 → 修正後

## 人間の確認が必要な事項

なし / 未解消事項
```

加えて開始・終了時刻、検索・取得呼び出し数を返します。

監査エージェント自身はファイルを編集しません。article-writerが具体的指摘を修正し、親が全指摘の反映を確認して、briefのPhase 7へ「指摘事項なし」または「反映済み」と記録します。

修正と再監査は最大3往復です。3回目でも重大な疑義が残れば公開しません。

## 12. SEO briefの役割

briefは内部設計・監査資料で、noteには投稿しません。

保存場所：

```text
articles/drafts/<slug>.seo-brief.md
```

必須記録：

- Phase 0の全変数
- 質問と回答
- 仮定と根拠
- Phase 1の分析と出典
- Phase 2の差別化3案と採点
- 推奨理由
- 素材要否
- クラスター
- 15語以上のエンティティ
- Phase 3の全見出し
- 各章の役割・配分・狙い
- 本文画像仕様
- タイトル候補10案
- 5軸採点
- 回収先H2
- 上位3案の選定理由
- メタ3案
- 各章の実測字数と配分差
- FAQ数
- JSON-LD
- 本文画像のパス、alt、挿入先
- 画像の目視検品結果
- アイキャッチ仕様
- Phase 7の監査結果
- 指摘の反映箇所
- 未確定タグ一覧
- 各Phaseの開始・終了時刻と呼び出し数

形式：[note-format.md](docs/note-format.md)

## 13. 記事Markdownの入出力形式

保存場所：

```text
articles/drafts/<slug>.md
```

冒頭：

```yaml
---
title: "28〜32字の採用タイトル"
topic_id: null
status: "draft"
created_at: "ISO8601"
---
```

本文の対応要素：

- H2
- H3
- 箇条書き
- 引用
- コードブロック
- 太字
- 斜体
- 打消し
- リンク
- 画像
- `<toc>`
- `<pay>`

非対応または禁止：

- H4以降
- 本文中のMarkdown表
- 本文中の独自meta
- 本文中のJSON-LD
- リモート本文画像
- data URL画像
- 空alt
- 同じ画像の重複利用

仕様：[note-format.md](docs/note-format.md)

## 14. artifact manifest

記事作成開始時に、作業ファイル管理用manifestを作ります。

```bash
node scripts/article_run_artifacts.mjs start
```

実装：[article_run_artifacts.mjs](scripts/article_run_artifacts.mjs)

### startの入力と出力

入力：

- コマンドのみ

出力：

```json
{
  "manifestPath": "/tmp/auto-note-article-runs/<uuid>.json",
  "baselineCount": 既存成果物数
}
```

開始時点で存在するMarkdown・画像を`baseline`として記録します。

### register

新しく作った次のファイルを直後に登録します。

- 本文
- brief
- 本文画像
- アイキャッチ
- 投稿時に作った公開用Markdown

```bash
node scripts/article_run_artifacts.mjs register <manifest> <path...>
```

既存ファイルを登録しようとすると拒否します。

### status

```bash
node scripts/article_run_artifacts.mjs status <manifest>
```

出力：

- `registered`：今回の所有ファイル
- `unregistered`：開始後に増えたが今回登録されていないファイル

### cleanup

noteへの保存または公開が検証成功した場合だけ使います。

```bash
node scripts/article_run_artifacts.mjs cleanup <manifest>
```

今回登録したファイルだけを削除します。開始前から存在するファイルは削除しません。

### close

次の場合に使います。

- ローカルのみ
- 投稿しない
- 無人実行
- 投稿結果不明
- 部分成功
- 復旧が必要

```bash
node scripts/article_run_artifacts.mjs close <manifest>
```

manifestだけを終了し、記事や画像は保持します。

## 15. note投稿で使うMCPツール

MCPは3ツールに限定されています。

実装：[note_mcp_server.mjs](scripts/note_mcp_server.mjs)

### note_session_status

入力：

```json
{}
```

出力例：

```json
{
  "running": true,
  "loggedIn": true,
  "profileDirectory": "...",
  "noteTabUrl": "...",
  "user": {
    "id": "...",
    "urlname": "...",
    "nickname": "..."
  }
}
```

### open_note_login

入力：

```json
{}
```

専用Chromeプロファイルを開きます。

出力：

- ブラウザ起動状態
- ログイン状態
- 手動ログイン案内

ログイン情報は自動入力しません。Cookieも抽出しません。本人が手動ログインします。

再確認は最大3回で、それでもログインできなければタイムアウトとして停止します。

### publish_note

必須入力：

```json
{
  "draft_path": "articles/drafts/example.md",
  "eyecatch_path": "articles/drafts/images/eyecatch-example.png"
}
```

任意入力：

```json
{
  "is_publish": false,
  "user_approved": false,
  "hashtags": ["タグ"],
  "price": 0,
  "magazine_keys": []
}
```

`is_publish`の既定値は`false`です。

出力：

- `ok`
- note ID
- note key
- edit URLまたはpublic URL
- mode
- `verification.saved`
- `verification.published`
- `verification.eyecatchUrl`
- `verification.checkedAt`
- ローカルstate記録
- publication attemptのパス
- エラー時の`doNotRetry`

## 16. 投稿前の強制条件

投稿処理は次を満たさないと開始しません。

- 本文が`articles/drafts`内にある
- `.seo-brief.md`ではない
- frontmatterがある
- `status: draft`
- 未確定タグがない
- 本文画像が2〜3枚
- 画像ごとに空でないaltがある
- 画像参照が重複していない
- リモート画像やdata URLでない
- 本文画像が`drafts`内に実在する
- アイキャッチが`drafts/images`内にある
- PNGアイキャッチの場合は1280×670px
- 同じタイトル／ファイルの既存note下書きがない
- 本公開ならPhase 7記録がある
- 同一内容・同一公開意図の危険な再試行記録がない

実装：[note_publish_core.mjs](scripts/note_publish_core.mjs)

## 17. 投稿結果とstate更新

検証済みの投稿結果は、概ね次の形で`articles/state.json`へ記録されます。

```json
{
  "file": null,
  "title": "記事タイトル",
  "note_url": "編集URLまたは公開URL",
  "note_id": 123,
  "note_key": "n...",
  "is_publish": false,
  "verification": {
    "saved": true,
    "published": false,
    "eyecatchUrl": "https://...",
    "checkedAt": "ISO8601"
  },
  "at": "ISO8601"
}
```

下書きなら`state.drafts`へ、本公開なら`state.published`へ入ります。

採用したトピックは`topic_backlog`から除き、次を`topic_history`へ残します。

```json
{
  "topic_id": "...",
  "kw": "...",
  "title": "...",
  "at": "ISO8601"
}
```

専任エージェントがstateを直接触ることはありません。投稿時の最終note情報は、親が同期的に呼び出すMCP処理が記録します。

## 18. 投稿失敗と再試行防止

noteへの書き込みは、通信が切れると「実際には保存されたが、応答だけ失われた」可能性があります。そのため、安易に再投稿しません。

投稿前に、本文内容と公開意図のハッシュを使って以下へ記録します。

```text
articles/publication-attempts/<sha256>.json
```

状態：

- `started`：開始済み、結果不明の可能性あり
- `verified`：検証成功
- `needs_review`：確認が必要
- `doNotRetry: true`：自動再投稿禁止
- `doNotRetry: false`：note API到達前と確認できたため、原因解消後に再実行可能

次の場合は再投稿しません。

- note API到達後のエラー
- API到達の有無が不明
- 通信切断
- note保存成功・ローカルstate更新失敗
- `started`のまま異常終了
- `doNotRetry:true`

その場合はnote.com側を本人に確認してもらい、記事・画像・manifest・試行記録を保持します。

## 19. 単発と複数記事の違い

件数指定がない場合は1本です。勝手に複数記事へ増やしません。

複数記事になるのは次の場合だけです。

- 複数テーマが明示された
- 「N本」と指定された
- backlogから複数選択するよう指定された

件数だけ指定され、backlogが不足している場合は、テーマを勝手に作りません。テーマ指定または`note-topic-ideas`で補充してよいか確認します。

複数記事では工程単位の波で処理します。

```text
全記事のPhase 1を並列
        ↓ 全記事が揃う
全記事のPhase 2〜3を並列
        ↓ 全記事が揃う
各記事を執筆、画像生成を並列
        ↓ 全記事が検証済み
全記事のPhase 7を並列
        ↓
1記事ずつ投稿・検証
```

ただし、記事Aの調査結果を記事Bへ渡すことは禁止です。各記事には独立した入力、本文、brief、画像を持たせます。

画像も記事ごとに新規生成し、使い回しません。

投稿は1本ずつ行い、保存状態と画像URLを確認してから次の記事へ進みます。結果不明や部分成功が出た場合は、後続投稿を止めます。

## 20. リライト時の違い

既存記事のリライトでは、新規記事と手順が異なります。

仕様：[rewrite.md](.agents/skills/note-article-seo-draft/references/rewrite.md)

標準処理：

1. 元記事を読む
2. `seo-researcher`でPhase 1を実施
3. `seo-planner`でPhase 2だけ実施
4. Phase 3の新規アウトライン設計は省略
5. `seo-auditor`で元記事を監査
6. 分析と「修正前→修正後」を報告
7. 元記事は自動編集しない
8. 追加依頼があった場合のみarticle-writerが承認箇所を編集し、画像生成・検証・独立監査へ進む

公開済みnote記事や既存note下書きを、`publish_note`で新規作成し直すことは禁止です。既存note更新は現在のMCPの対象外なので、noteエディタで手動反映する運用です。

## 21. 最終報告の出力

記事作成が終わると、記事ごとに次を報告します。

- 完了／未完了／未着手
- note下書きURLまたは公開URL
- 投稿しなかった場合の停止理由
- 本文パス
- briefパス
- 本文画像パス
- アイキャッチパス
- ファイルを削除したか保持したか
- 本文総字数
- 各章の実測字数
- 各章の予定との差
- 本文画像2〜3枚のalt
- 各画像の挿入位置
- 画像の目視検品結果
- 監査指摘
- 指摘への修正内容
- 仮定と根拠
- 未確定タグ一覧
- state更新結果
- manifestの終了状態
- バッチの場合は完了・未完了・未着手件数

つまり、最終成果物は「本文Markdownだけ」ではありません。記事、設計・証拠記録、本文画像、アイキャッチ、機械検証、独立監査、保存検証、state、成果物の所有記録までが1つの完成単位になっています。
