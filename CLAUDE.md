# auto-note

note.com への記事投稿を Claude Code に自動化させるプロジェクト。
「[Getting started with loops](https://claude.com/blog/getting-started-with-loops)」で説明されている
ループエンジニアリングの考え方に沿って構成している。

## このプロジェクトがやること

1. お題（トピック）から note 用の記事本文を生成する
2. 生成した記事を自己検証する（文字数・構成・重複トピックの有無など）
3. 検証を通った記事を note に下書き保存する（既定では自動公開はしない）
4. 何を書いたか・何を投稿したかを `articles/state.json` に記録し、次回ループでの重複を防ぐ

投稿は note.com に公式の書き込み API が無いため、非公式ライブラリ
[NoteClient2](https://github.com/Mr-SuperInsane/NoteClient2)（`pip install NoteClient2`、
Playwright ログイン + note 内部 API、`scripts/post_note.py` から呼び出す）を使う。
認証は `.env` の `email` / `password` / `user_url_id`（`.env.example` 参照、コミットしない）。

## 安全設計（重要）

- 既定はスキル・スクリプトとも `is_publish=False` 相当（下書き保存まで）。実際の公開
  （`--publish` を付けての実行）は、ユーザーが対象記事を個別に明示承認した場合のみ行う。
  ループ実行中に自動判断で公開しない。
- 1 ループ実行あたり生成する記事数の上限を必ず決めてから回す（例: 1 日 1 本まで）。
- 生成した記事のトピック・タイトルは `articles/state.json` の履歴と突き合わせ、重複や類似を避ける。
- 投稿先アカウントは常にユーザー本人の note アカウントであることを前提とする。他人のアカウントや
  スクレイピング目的でこの仕組みを使わない。
- NoteClient2 は非公式・非商用限定ライセンス（INSANE License）。過度な自動投稿・スパム的な
  連続投稿はしない。note 側の仕様変更でライブラリが壊れる可能性がある前提で運用する。
- `.env` の内容（メールアドレス・パスワード）を出力・引用・ログに残さない。

## ループの種類と使い分け

記事の 4 分類に沿って、このリポジトリでは主に以下を使う。

| 種類 | 起動方法 | 停止条件 | 用途 |
|---|---|---|---|
| ターンベース | 通常のプロンプト / `note-article-draft` スキル呼び出し | 1 本の記事が生成・自己検証を通るまで | 1 本だけ手動で書かせたいとき |
| ゴールベース | `/goal` | 目標本数に到達 or 最大試行回数 | 「今週中に3本ドラフトを作る」等 |
| 時間ベース | `/loop` または `/schedule` | ユーザーがキャンセルするまで | 定期的にネタを1本ずつドラフトする |
| プロアクティブ | `/schedule` の cron ルーチン | 手動停止まで | 完全自動運用（下書きまで） |

具体的な起動例は `README.md` を参照。

## ディレクトリ構成

```
.claude/skills/
  note-topic-ideas/     トピック案をバックログに追加するスキル
  note-article-draft/   トピックから記事を生成し自己検証するスキル
  note-article-publish/ 承認済み下書きを NoteClient2 経由で note に投稿するスキル
scripts/
  post_note.py           NoteClient2 を呼び出す投稿スクリプト本体
articles/
  drafts/                生成した記事の Markdown（レビュー待ち）
  published/              note に投稿済みの記事のアーカイブ
  state.json              トピック履歴・投稿履歴・重複防止用の状態
.env.example              NoteClient2 用の認証情報テンプレート（実値は .env、コミット禁止）
requirements.txt           Python 依存関係（NoteClient2, python-dotenv）
```

## 記事のスタイルガイド

（未設定。トーン・文字数の目安・扱ってよいトピック/避けるトピックをここに追記していく。
記事生成スキルはこのセクションを必ず読んでから執筆すること。）
