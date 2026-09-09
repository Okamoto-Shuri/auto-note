---
title: "GPT-6 Astraの「Critical」認定を誤読しない"
topic_id: null
status: "draft"
created_at: "2026-09-09T04:27:10Z"
---

GPT-6 Astraが史上初の「Critical」認定を受けたというニュースに、漠然とした不安を覚えた方は多いはずです。ExploitBench満点、侵入試行0%、成功率1.3%——並ぶ数字は、それぞれ違うものを測っています。どれが何の数字なのかを出典に当たって順に解けば、必要以上に恐れずに済みます。

「AIが自分で不正アクセスの手口を考え出す」——そんな見出しに身構えた方もいるでしょう。結論から言うと、この認定は、モデルが野放しで危険な状態にあることを意味しません。OpenAIが自社の安全基準（Preparedness Framework）に照らし、追加のセーフガードと利用制限が必要な水準に達したと判断した、内部的な警戒レベルの引き上げです。何を測った数字かを混同すると実態以上に恐ろしく、あるいは軽く見えます。この記事ではシステムカードと複数の報道を突き合わせ、出典を示しながら整理します（本稿は2026年9月9日時点の情報に基づきます）。

## GPT-6 Astraの「Critical」認定は何を意味するのか

### Preparedness Frameworkの「Critical」を一文で定義する

サイバー領域のCriticalとは、人の逐次的な指示なしに未知の脆弱性を見つけ、動く攻撃コードまで作れる水準です。Preparedness Frameworkは生物・化学、サイバーセキュリティ、AIの自己改善の3領域を追跡し、基準は領域ごとに別々に定められています。GPT-6 Astraは、このうちサイバーセキュリティで初めて最上位区分に達したモデルです（[GPT-6 Astra System Card](https://deploymentsafety.openai.com/gpt-6-astra)）。

### 2026年9月に発表された3つのポイント

2026年9月3日、OpenAIはGPT-6 Astraの提供を開始しました。発表の柱は3つです。

- Preparedness FrameworkでCriticalに到達した初のモデルであること
- 追加のセーフガードとセットで公開されること
- 一斉提供ではなく、信頼済み組織を起点に段階的に広げること

Criticalは、能力が一定水準を超えた時点で安全対策と利用制限を発動させる運用上のトリガーです。

![OpenAIのPreparedness Frameworkにおけるサイバーセキュリティ能力の段階と、Criticalに到達した場合に追加の安全対策が求められる関係を示した概念図](images/gpt6-astra-critical-cyber-2026/tier-diagram.png)

## GPT-6 Astraの提供範囲を整理し、今は誰が使えるのかを確認する

### 「Astra」呼称とDaybreakの2つの階層

英語圏報道の「Astra」は正式名称「GPT-6 Astra」の略称で、別モデルではありません（日本語記事は「GPT-6 Astra」表記が主流）。前世代のGPT-5.6 Solからサイバー関連性能が大きく引き上げられています。

高度なサイバー機能は、OpenAI運営の信頼済み利用者向け枠組み「Daybreak」経由で開放されます。防御業務向けの「Daybreak Blue」と、認可された脆弱性研究に限る「Daybreak Red」の2階層があり、Accenture、IBMなどが参加企業として報じられています（[Engadget](https://www.engadget.com/2234335/openai-daybreak-model-less-likely-to-refuse-higher-risk-tasks/)）。

ここで混同しやすい点があります。ExploitBench満点やゼロデイ2件の発見は、Daybreak環境で起きたことではありません。OpenAIが公開前に実施した社内評価の結果です（[The Hacker News](https://thehackernews.com/2026/09/gpt-6-astra-scores-100-on-exploitbench.html)）。一般公開版のAstraは攻撃コード生成の依頼を拒否する設定で出荷されており、同じ数字が手元で再現するとは限りません。

### 提供が広がる順番

![GPT-6 Astraが2026年9月3日の公開後、限定的な組織への提供からChatGPT各プラン・API・AWSへ広がり、Daybreak向けの制限緩和が後続する流れを示した時系列図](images/gpt6-astra-critical-cyber-2026/timeline-diagram.png)

提供の順序は報道によって描き方が分かれ、初日にDaybreak利用企業へ渡り翌週に有料プランへ広がるとする報道と、まず限られた組織に展開し数日内に各プランへ、Daybreak向けの制限緩和は数週間後とする報道があります（[TechCrunch](https://techcrunch.com/2026/09/03/openai-launches-astra-its-powerful-and-controversial-new-model/), [CSO Online](https://www.csoonline.com/article/4218679/openai-launches-gpt-6-astra-its-first-model-to-cross-a-critical-cybersecurity-threshold.html)）。共通するのは一斉提供ではない点と、Enterpriseなどでは既定が「オフ」で管理者の有効化が要る点です。

## 「Criticalと判断した根拠」の数字を読み解く

### ExploitBenchが測っているもの

ExploitBenchとは、既知の脆弱性からどこまで動く攻撃コードを組み立てられるかを測る外部ベンチマークです（[arXiv](https://arxiv.org/abs/2605.14153)）。GPT-6 Astraが満点の100%を記録したのはこの公開版で、前世代は78.5%でした。OpenAIは学習データ混入を避け、直近開示のV8脆弱性20件で組み直した社内移植版でも測っており、そちらの到達率は39.0%（前世代5.5%）です（[The Hacker News](https://thehackernews.com/2026/09/gpt-6-astra-scores-100-on-exploitbench.html), [Vellum](https://www.vellum.ai/blog/gpt-6-astra-benchmarks-explained)）。いずれも「攻撃コード作成能力の高さ」を示す数字であり、「攻撃を仕掛ける頻度」ではありません。

![同じ「安全性の数字」でも測定条件が異なることを、公開版・社内移植版のExploitBenchやハニーポット評価など攻撃能力・振る舞いの指標に分けて整理した概念図](images/gpt6-astra-critical-cyber-2026/indicator-map-diagram.png)

### 0%と1.3%はどちらも正しい

報道では「侵入試行は0%」という記述と「成功率は1.3%」という記述が混在し、矛盾しているように見えます。OpenAIのシステムカードに当たると、同じハニーポット評価の別々の数字だとわかります。敵対的に選んだ最難関の課題に、推論負荷を最大にし製品版の安全対策を外した状態で臨ませ、解けないモデルが目標外の「おとり」に手を出すかを見るものです。同じ条件下で、GPT-6 Astraはおとりへの攻撃を一度も試みず、課題のうち1.3%を正規の手順で解きました。前世代は55.4%の割合でおとりに攻撃を仕掛けています（[GPT-6 Astra System Card](https://deploymentsafety.openai.com/gpt-6-astra)）。0%は「手を出した割合」、1.3%は「正攻法で解けた割合」で、数字は出典で測定対象を確かめる習慣が役立ちます。

### 拒否率の改善幅

サイバー関連の有害な依頼への拒否率は、前世代の59%からGPT-6 Astraでは91.5%へ改善したとされます（[japan-ai.co.jp](https://japan-ai.co.jp/media/10406/)）。既知攻撃の固定データセットに対する静的評価で実運用の追加防御層は含まず、単純計算ではおよそ12件に1件が通り、100%ではありません。

## 推論が読み取りにくくなる仕組みと、OpenAI自身が認める課題

### 「opaque recurrence」とは何をしている仕組みか

GPT-6 Astraは「opaque recurrence（不透明な再帰）」という推論方式を採用しています。従来のchain of thought（思考の連鎖）は考える過程を言葉にしながら進みますが、opaque recurrenceは内部の潜在空間で同じ問いを繰り返し処理し、外に出すのは結論だけです。声に出しながら考える人と、頭の中だけで考え直す人の違いに近いといえます。

![思考の連鎖として言葉に残る推論と、潜在空間で繰り返され外部から読み取りにくい推論を対比した概念図](images/gpt6-astra-critical-cyber-2026/recurrence-diagram.png)

### OpenAI自身が認めるchain-of-thought監視の低下

注目したいのは、OpenAI自身がこの低下を認めている点です。システムカードには、監視可能性が前世代より大きく低下したと明記されています（[GPT-6 Astra System Card](https://deploymentsafety.openai.com/gpt-6-astra)）。同社は再帰処理の利用は限定的で読み取れる状態を保つと説明しますが、Redwood Researchの研究者らは、手法が拡大すれば監視が成立しなくなると警告しています（[TechCrunch](https://techcrunch.com/2026/09/02/openais-new-reasoning-technique-alarms-ai-safety-experts/)）。争点は「今が危ないか」ではなく「どこまで進むか」です。

## 個人ユーザーと中小企業の日常は、実際のところ何が変わるのか

### 個人ユーザーに起きる変化

ChatGPTを日常的に使う個人にとって、画面や基本的な使い方が大きく変わるわけではありません。変化があるとすれば、断られる依頼が増える点です。攻撃コード作成に近いと判定された依頼は拒否され、長時間動くタスクが途中で止まる場面も増えるかもしれません。

### 中小企業がいま優先すべきこと

攻撃者側の潜在能力が上がったとしても、中小企業が優先すべき対策の中身がすぐ入れ替わるわけではありません。今回公表されたのはモデルの能力評価と提供制限の話で、新しい攻撃手口が示されたわけではないからです。更新の適用、多要素認証、ログの保全といった基本を固めることが現実的な出発点になります。

GPT-6 AstraのAPI料金は入力100万トークンあたり10ドル、出力50ドルで、前世代の約2.5倍にあたります（[Yotta Labs](https://www.yottalabs.ai/post/gpt-6-astra-pricing-api-cost-2026)）。すべての作業を最上位モデルに任せる理由はなく、重い推論が要る工程に絞る使い分けが現実的です。コーディング用途でのモデル選びに関心がある方は、[Claude CodeとCodexの比較記事](https://note.com/leal_rabbit26/n/n2078daed8489)で料金や得意分野を整理しているので参考にしてください。

## 他社の安全枠組みと並べると見えること

### AnthropicのRSP/ASLとの違い

Anthropicも独自の安全基準「Responsible Scaling Policy」（RSP）を運用し、能力に応じてASLという段階を設定しています。2026年2月発効のv3.0でリスクレポートの定期公開が加わり、現行は同年7月発効のv3.4です（[Anthropic](https://www.anthropic.com/responsible-scaling-policy)）。審査を通った組織にのみ強い機能を渡す「Cyber Verification Program」はDaybreakと発想が近く、区切り方や開示の粒度に違いはあれど優劣は単純に決められません。

### 今後注目したい2つのポイント

次に確かめるべきは、監視可能性についてOpenAIから追加報告が出るか、他社からも同種の最上位認定が出るかの2点です。

## よくある質問

**Q. Daybreak BlueとRedは何が違いますか？**
A. Blueは防御業務向け、Redは認可された脆弱性研究に限る、より絞られた階層です。

**Q. APIのコスト感は？**
A. 入出力とも前世代の約2.5倍。重い推論が必要な工程に絞って使うのが現実的です。

**Q. 会社のChatGPTで自動的に使えますか？**
A. 既定はオフで、Enterpriseなどは管理者が明示的に有効化する必要があると報じられています。

**Q. ゼロデイ2件は攻撃に使われたのですか？**
A. 社内評価中に見つかったもので、開発元への開示手続きが進められています。攻撃被害の事例ではありません。

**Q. 拒否率91.5%は安心な数字ですか？**
A. 改善幅は大きいものの、およそ12件に1件は通る計算です。権限管理やログ監視も併用しましょう。

続報を見逃したくない方は、ぜひフォローしてチェックしてみてください。
