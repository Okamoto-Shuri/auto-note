#!/usr/bin/env python3
"""articles/drafts/ の記事を NoteClient2 経由で note.com に投稿する。

既定では下書き保存のみ（is_publish=False）。実際に公開するのはユーザーが
個別の記事を明示承認したときだけにし、その場合のみ --publish を付けること。

Usage:
    python scripts/post_note.py articles/drafts/<slug>.md [options]

Options:
    --title TEXT        frontmatter の title を上書きする場合のみ指定
    --eyecatch PATH      アイキャッチ画像
    --hashtag TAG        複数指定可 (--hashtag Python --hashtag note)
    --price INT          有料記事の価格。0 で無料（既定）
    --magazine KEY        マガジンキー。複数指定可
    --publish            付けた場合のみ実際に公開する。付けなければ下書き保存のみ
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE_PATH = ROOT / "articles" / "state.json"


def split_frontmatter(md_path: Path) -> tuple[dict, str]:
    """YAML風frontmatterを分離して返す。

    NoteClient2 の markdown_parser は frontmatter を認識せず、`---` 行を
    そのまま <hr> として本文に変換してしまう。frontmatter を含むファイルを
    そのまま渡すと記事冒頭に `title: "..."` 等がそのまま出力されるため、
    必ず本文だけを抽出してから NoteClient2 に渡すこと。
    """
    text = md_path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    frontmatter = {}
    for line in text[3:end].strip().splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip().strip('"')
    body = text[end + 4:].lstrip("\n")
    return frontmatter, body


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def record_result(draft_path: Path, title: str, published: bool, result: dict) -> None:
    state = load_state()
    rel_path = str(draft_path.relative_to(ROOT))
    data = result.get("data") or {}
    entry = {
        "file": rel_path,
        "title": title,
        "note_url": data.get("public_url") or data.get("edit_url"),
        "note_id": data.get("note_id"),
        "note_key": data.get("note_key"),
        "is_publish": published,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if published:
        state.setdefault("published", []).append(entry)
        state["drafts"] = [d for d in state.get("drafts", []) if d.get("file") != rel_path]
    else:
        drafts = state.setdefault("drafts", [])
        for d in drafts:
            if d.get("file") == rel_path:
                d.update(entry)
                break
        else:
            drafts.append(entry)
    save_state(state)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("draft", type=Path, help="articles/drafts/<slug>.md")
    parser.add_argument("--title", help="frontmatter の title を上書き")
    parser.add_argument("--eyecatch", type=Path, default=None)
    parser.add_argument("--hashtag", action="append", default=[], dest="hashtags")
    parser.add_argument("--price", type=int, default=0)
    parser.add_argument("--magazine", action="append", default=[], dest="magazine_key")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="付けた場合のみ公開する。既定は下書き保存のみ。ユーザーが個別に承認した記事にだけ使うこと。",
    )
    args = parser.parse_args()

    if not args.draft.exists():
        print(f"draft not found: {args.draft}", file=sys.stderr)
        return 1

    frontmatter, body = split_frontmatter(args.draft)
    title = args.title or frontmatter.get("title")
    if not title:
        print("title が frontmatter に無い場合は --title を指定してください", file=sys.stderr)
        return 1

    from dotenv import load_dotenv

    load_dotenv()
    email = os.getenv("email")
    password = os.getenv("password")
    user_url_id = os.getenv("user_url_id")
    if not all([email, password, user_url_id]):
        print(".env に email / password / user_url_id を設定してください（.env.example 参照）", file=sys.stderr)
        return 1

    from NoteClient2 import NoteClient2

    # 認証Cookieを含むセッションファイル。リポジトリ直下に置かれないよう明示指定し、
    # .gitignore で除外する（既定値の "session.json" のままだと cwd 直下に作られる）。
    session_file = str(ROOT / ".note_session.json")
    client = NoteClient2(email=email, password=password, user_urlname=user_url_id, session_file=session_file)

    # frontmatter を除いた本文だけを一時ファイルに書き出して渡す（画像パスは
    # NoteClient2 がプロセスの cwd 基準で解決するため、本文中の画像参照は
    # リポジトリルートからの相対パスか絶対パスにしておくこと）。
    with tempfile.NamedTemporaryFile(
        mode="w", prefix=".note_publish_tmp_", suffix=".md", delete=False, encoding="utf-8", dir=str(ROOT)
    ) as tmp:
        tmp.write(body)
        body_path = tmp.name

    try:
        result = client.publish(
            title=title,
            md_file_path=body_path,
            eyecatch_path=str(args.eyecatch) if args.eyecatch else None,
            hashtags=args.hashtags,
            price=args.price,
            magazine_key=args.magazine_key,
            is_publish=args.publish,
        )
    finally:
        os.unlink(body_path)

    print(json.dumps(result, ensure_ascii=False, indent=2))

    if not result.get("ok"):
        print("投稿に失敗しました。上記の result を確認してください。", file=sys.stderr)
        return 1

    record_result(args.draft, title, args.publish, result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
