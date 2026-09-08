/**
 * note.com 非公式・内部APIを直接叩いて記事を投稿するためのブラウザ実行スクリプト。
 *
 * 前提:
 * - note.com にログイン済みの認証済みブラウザタブ（Claude-in-Chrome）上で実行する。
 * - Playwright によるヘッドレス自動ログインは行わない（note.com 側のボット検知で
 *   ブロックされることが確認されているため）。認証はユーザー本人が手動ログイン
 *   したブラウザセッションの Cookie にすべて委ねる。
 * - CSRF対策の `XSRF-TOKEN` Cookie の値のみを最小スコープで読み取り、API呼び出しの
 *   `X-XSRF-TOKEN` ヘッダーに設定する用途にだけ使う。セッションCookie等、認証情報
 *   そのものに相当するCookieには一切アクセスしない。
 *
 * 使い方（Claude Code から javascript_tool で実行する想定）:
 *   1. 本ファイルの内容をそのまま実行し、`window.NoteWeb` を定義する。
 *   2. `await NoteWeb.publish({ title, markdown, images, eyecatch, hashtags, price,
 *      magazineKeys, isPublish })` を呼び出す。images / eyecatch はローカル画像を
 *      base64 化して渡す（ブラウザJSはローカルファイルパスを直接読めないため）。
 *
 * 参考実装: https://github.com/Mr-SuperInsane/NoteClient2
 * （Playwright + note内部APIを使う非公式Pythonライブラリ。本スクリプトは、その
 *   内部API呼び出し部分・Markdown変換ロジックをブラウザ実行用に移植したもので、
 *   ログイン部分だけをブラウザの実セッション利用に置き換えている）
 */
(function () {
  function readXsrfToken() {
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function authHeaders(extra) {
    return Object.assign(
      {
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": readXsrfToken(),
      },
      extra || {}
    );
  }

  async function apiPost(url, jsonBody) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(jsonBody),
    });
    return finishResponse(res);
  }

  async function apiPut(url, jsonBody) {
    const res = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(jsonBody),
    });
    return finishResponse(res);
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: "include" });
    return finishResponse(res);
  }

  async function finishResponse(res) {
    let json = null;
    let text = "";
    try {
      text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      // json でなければ text のまま
    }
    return { ok: res.ok, status: res.status, json, text };
  }

  function base64ToBlob(base64, mime) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mime });
  }

  // ---- Markdown -> note HTML 変換 ----
  // NoteClient2/markdown_parser.py の移植版。
  // images は事前アップロード済みの { [参照パス]: { url, key } } マップを渡すこと。

  function parseInline(text) {
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
    return text;
  }

  function buildListHtml(buffer) {
    if (!buffer.length) return { html: "", uid: null };
    const isOrdered = /^\d+\./.test(buffer[0].marker);
    const tag = isOrdered ? "ol" : "ul";
    const rootUid = crypto.randomUUID();
    let html = isOrdered
      ? `<${tag} data-start="1" name="${rootUid}" id="${rootUid}">`
      : `<${tag} name="${rootUid}" id="${rootUid}">`;
    for (const item of buffer) {
      const pUid = crypto.randomUUID();
      html += `<li><p name="${pUid}" id="${pUid}">${parseInline(item.text)}</p></li>`;
    }
    html += `</${tag}>`;
    return { html, uid: rootUid };
  }

  function markdownToHtml(md, imageMap) {
    imageMap = imageMap || {};
    const lines = md.split("\n");

    let freeParts = [];
    let payParts = [];
    let currentParts = freeParts;

    const imageKeys = [];
    let separatorId = null;
    let lastBlockId = null;

    let inCode = false;
    let listBuffer = [];
    let payTagCount = 0;

    function flushList() {
      if (listBuffer.length) {
        const { html, uid } = buildListHtml(listBuffer);
        currentParts.push(html);
        lastBlockId = uid;
        listBuffer = [];
      }
    }

    for (const raw of lines) {
      const stripped = raw.trim();
      const lower = stripped.toLowerCase();

      if (lower.includes("</pay>")) {
        return { ok: false, error: { type: "InvalidPayTag", message: "</pay> is not allowed" } };
      }

      if (stripped.startsWith("```")) {
        flushList();
        if (!inCode) {
          inCode = true;
          const uid = crypto.randomUUID();
          const lang = stripped.replace(/`/g, "").trim();
          currentParts.push(`<pre name="${uid}" id="${uid}" data-lang="${lang}"><code>`);
          lastBlockId = uid;
        } else {
          inCode = false;
          currentParts.push("</code></pre>");
        }
        continue;
      }
      if (inCode) {
        currentParts.push(raw);
        continue;
      }
      if (!stripped) {
        flushList();
        continue;
      }

      const listMatch = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
      if (listMatch) {
        listBuffer.push({ marker: listMatch[2], text: listMatch[3] });
        continue;
      } else {
        flushList();
      }

      if (lower.includes("<toc>") || lower.includes("<table of content>")) {
        const uid = crypto.randomUUID();
        const headUid = crypto.randomUUID();
        currentParts.push(`<h2 name="${headUid}" id="${headUid}">目次</h2>`);
        currentParts.push(`<table-of-contents name="${uid}" id="${uid}"><br></table-of-contents>`);
        lastBlockId = uid;
        continue;
      }

      if (lower.includes("<pay>") || lower.includes("<pay_line>")) {
        if (lower !== "<pay>") {
          return { ok: false, error: { type: "InvalidPayTag", message: "<pay> must be on its own line" } };
        }
        if (payTagCount >= 1) {
          return { ok: false, error: { type: "InvalidPayTag", message: "<pay> allowed only once" } };
        }
        payTagCount += 1;
        if (lastBlockId) separatorId = lastBlockId;

        currentParts = payParts;
        const sepUid = crypto.randomUUID();
        currentParts.push(`<span name="${sepUid}" id="${sepUid}"></span>`);
        lastBlockId = sepUid;
        continue;
      }

      const imgMatch = stripped.match(/!\[(.*?)\]\((.*?)\)/);
      if (imgMatch) {
        const altText = imgMatch[1];
        const imgPath = imgMatch[2];
        const resolved = imageMap[imgPath];
        if (!resolved) {
          return {
            ok: false,
            error: { type: "ImageNotUploaded", message: "image not pre-uploaded", path: imgPath },
          };
        }
        const uid = crypto.randomUUID();
        currentParts.push(
          `<figure name="${uid}" id="${uid}" class="note-image" data-image-key="${resolved.key}">` +
            `<a href="${resolved.url}" rel="noopener noreferrer" target="_blank">` +
            `<img src="${resolved.url}" alt="画像" data-src="${resolved.url}"></a>` +
            `<figcaption>${altText}</figcaption></figure>`
        );
        imageKeys.push(resolved.key.split("/").pop().split(".")[0]);
        lastBlockId = uid;
        continue;
      }

      const uid = crypto.randomUUID();
      const content = parseInline(stripped);
      if (stripped.startsWith("### ")) {
        currentParts.push(`<h3 name="${uid}" id="${uid}">${content.replace(/^#+\s*/, "")}</h3>`);
      } else if (stripped.startsWith("# ") || stripped.startsWith("## ")) {
        currentParts.push(`<h2 name="${uid}" id="${uid}">${content.replace(/^#+\s*/, "")}</h2>`);
      } else if (stripped.startsWith("> ")) {
        currentParts.push(`<blockquote name="${uid}" id="${uid}">${content.replace(/^>\s*/, "")}</blockquote>`);
      } else if (stripped.startsWith("---") || stripped.startsWith("***")) {
        currentParts.push(`<hr name="${uid}" id="${uid}">`);
      } else {
        currentParts.push(`<p name="${uid}" id="${uid}">${content}</p>`);
      }
      lastBlockId = uid;
    }
    flushList();

    // <pre>...</pre> の内部だけ改行を挟んで結合する（それ以外は直結合）。
    // NoteClient2/markdown_parser.py の build_html() と同じロジック。
    function buildHtml(parts) {
      let final = "";
      let isInCode = false;
      for (const part of parts) {
        if (part.includes("<pre")) isInCode = true;
        final += isInCode ? part + "\n" : part;
        if (part.includes("</pre>")) isInCode = false;
      }
      return final;
    }

    const freeHtml = buildHtml(freeParts);
    const payHtml = buildHtml(payParts);

    return {
      ok: true,
      data: {
        freeHtml,
        payHtml,
        combinedHtml: freeHtml + payHtml,
        imageKeys,
        separatorId,
        hasPay: payTagCount === 1,
      },
    };
  }

  // ---- 画像アップロード ----

  async function uploadImage(base64, filename, mime) {
    const ext = (filename.match(/\.[^.]+$/) || [".png"])[0];
    const uuidName = `${crypto.randomUUID().replace(/-/g, "")}${ext}`;

    const presignForm = new FormData();
    presignForm.append("filename", uuidName);

    const presignRes = await fetch("https://note.com/api/v3/images/upload/presigned_post", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: presignForm,
    });
    const presign = await finishResponse(presignRes);
    if (!presign.ok || !presign.json || !presign.json.data || !presign.json.data.action) {
      return { ok: false, error: { type: "PresignFailed", status: presign.status, detail: presign.text } };
    }
    const data = presign.json.data;

    const s3Form = new FormData();
    const postFields = data.post || {};
    for (const [k, v] of Object.entries(postFields)) {
      s3Form.append(k, v);
    }
    s3Form.append("file", base64ToBlob(base64, mime), uuidName);

    const s3Res = await fetch(data.action, { method: "POST", body: s3Form });
    if (!s3Res.ok) {
      const t = await s3Res.text().catch(() => "");
      return { ok: false, error: { type: "S3UploadFailed", status: s3Res.status, detail: t } };
    }

    if (!data.url || !data.path) {
      return { ok: false, error: { type: "UploadResultInvalid", detail: data } };
    }
    return { ok: true, data: { url: data.url, key: data.path } };
  }

  async function uploadEyecatch(base64, mime, noteId) {
    const form = new FormData();
    form.append("file", base64ToBlob(base64, mime), "blob");
    form.append("note_id", String(noteId));
    form.append("width", "1920");
    form.append("height", "1080");

    const res = await fetch("https://note.com/api/v1/image_upload/note_eyecatch", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const result = await finishResponse(res);
    if (!result.ok) {
      return { ok: false, error: { type: "EyecatchUploadFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: { uploaded: true } };
  }

  // ---- マガジン解決 ----

  async function resolveMagazineId(userUrlname, magazineKey) {
    if (!magazineKey) return { ok: true, data: { magazineId: null } };
    const url = `https://note.com/${userUrlname}/m/${magazineKey}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      return { ok: false, error: { type: "MagazinePageFetchFailed", status: res.status, url } };
    }
    const html = await res.text();
    let m = html.match(/magazineLayout\s*:\s*\{\s*id\s*:\s*(\d+)/);
    if (!m) m = html.match(/"magazineLayout"\s*:\s*\{\s*"id"\s*:\s*(\d+)/);
    if (!m) {
      return { ok: false, error: { type: "MagazineIdNotFound", url } };
    }
    return { ok: true, data: { magazineId: parseInt(m[1], 10) } };
  }

  // ---- 現在のユーザー情報 ----

  async function getCurrentUser() {
    const result = await apiGet("https://note.com/api/v2/current_user");
    if (!result.ok || !result.json || !result.json.data) {
      return { ok: false, error: { type: "CurrentUserFetchFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: result.json.data };
  }

  // ---- ノート作成・保存・公開 ----

  async function createNoteSkeleton() {
    const result = await apiPost("https://note.com/api/v1/text_notes", { template_key: null });
    if (!result.ok || !result.json || !result.json.data) {
      return { ok: false, error: { type: "CreateNoteFailed", status: result.status, detail: result.text } };
    }
    const noteData = result.json.data;
    if (!noteData.id || !noteData.key) {
      return { ok: false, error: { type: "CreateNoteMissingFields", detail: noteData } };
    }
    return { ok: true, data: noteData };
  }

  async function saveDraft(noteId, title, bodyHtml, imageKeys) {
    const plainText = bodyHtml.replace(/<[^>]+>/g, "");
    const result = await apiPost(
      `https://note.com/api/v1/text_notes/draft_save?id=${noteId}&is_temp_saved=true`,
      {
        body: bodyHtml,
        body_length: plainText.length,
        name: title,
        index: false,
        is_lead_form: false,
        image_keys: imageKeys || [],
      }
    );
    if (!result.ok) {
      return { ok: false, error: { type: "DraftSaveFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  async function tempSaveForPublish(noteId, title, combinedHtml) {
    const result = await apiPost(
      `https://note.com/api/v1/text_notes/draft_save?id=${noteId}&is_temp_saved=true`,
      { body: combinedHtml, name: title, index: true }
    );
    if (!result.ok) {
      return { ok: false, error: { type: "TempDraftSaveFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  async function finalizePublish(noteData, overrides) {
    const merged = Object.assign({}, noteData, overrides);
    const payload = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== undefined) payload[k] = v;
    }
    const result = await apiPut(`https://note.com/api/v1/text_notes/${noteData.id}`, payload);
    if (!result.ok) {
      return { ok: false, error: { type: "PublishFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  // ---- 画像の一括アップロード（Markdown中の![alt](path)を事前解決） ----

  async function uploadAllImages(images) {
    // images: [{ path, base64, mime }]
    const imageMap = {};
    for (const img of images || []) {
      const up = await uploadImage(img.base64, img.path, img.mime);
      if (!up.ok) return { ok: false, error: up.error };
      imageMap[img.path] = up.data;
    }
    return { ok: true, data: imageMap };
  }

  // ---- トップレベルの publish ----

  async function publish(opts) {
    const {
      title,
      markdown,
      images, // [{ path, base64, mime }] 省略可
      eyecatch, // { base64, mime } 省略可
      hashtags, // string[] 省略可
      price, // number 省略可（既定 0）
      magazineKeys, // string[] 省略可
      isPublish, // boolean 省略可（既定 false = 下書きのみ）
    } = opts;

    const priceValue = price || 0;
    const hashtagList = hashtags || [];
    const magazineKeyList = magazineKeys || [];

    // 1) 画像を先にアップロードして参照解決マップを作る
    const uploaded = await uploadAllImages(images);
    if (!uploaded.ok) return uploaded;
    const imageMap = uploaded.data;

    // 2) Markdown -> note HTML 変換
    const parsed = markdownToHtml(markdown, imageMap);
    if (!parsed.ok) return parsed;
    const { freeHtml, payHtml, combinedHtml, imageKeys, separatorId } = parsed.data;

    // 3) 現在のユーザー情報（urlname取得のため）
    const userResult = await getCurrentUser();
    if (!userResult.ok) return userResult;
    const userUrlname = userResult.data.urlname;

    // 4) マガジン解決
    const magazineIds = [];
    for (const key of magazineKeyList) {
      const r = await resolveMagazineId(userUrlname, key);
      if (!r.ok) return r;
      if (r.data.magazineId) magazineIds.push(r.data.magazineId);
    }

    // 5) ノート作成
    const created = await createNoteSkeleton();
    if (!created.ok) return created;
    const noteData = created.data;
    const noteId = noteData.id;
    const noteKey = noteData.key;

    // 6) アイキャッチ
    if (eyecatch) {
      const eye = await uploadEyecatch(eyecatch.base64, eyecatch.mime, noteId);
      if (!eye.ok) return eye;
    }

    // 7) 下書き保存のみ
    if (!isPublish) {
      const draft = await saveDraft(noteId, title, combinedHtml, imageKeys);
      if (!draft.ok) return draft;
      return {
        ok: true,
        data: {
          mode: "draft",
          noteId,
          noteKey,
          editUrl: `https://editor.note.com/notes/${noteKey}/edit`,
        },
      };
    }

    // 8) 公開: 一時保存 -> 本公開PUT
    const temp = await tempSaveForPublish(noteId, title, combinedHtml);
    if (!temp.ok) return temp;

    const formattedHashtags = hashtagList.map((t) => (t.startsWith("#") ? t : `#${t}`));
    const bodyLen = combinedHtml.replace(/<[^>]+>/g, "").length;

    const overrides = {
      name: title,
      free_body: freeHtml,
      pay_body: priceValue > 0 ? payHtml : "",
      status: "published",
      price: priceValue,
      separator: priceValue > 0 && separatorId ? separatorId : null,
      is_refund: false,
      limited: false,
      index: true,
      image_keys: imageKeys,
      hashtags: formattedHashtags,
      magazine_ids: magazineIds,
      magazine_keys: [],
      body_length: bodyLen,
      send_notifications_flag: true,
      lead_form: { is_active: false, consent_url: "" },
      line_add_friend: { is_active: false, keyword: "", add_friend_url: "" },
    };

    const final = await finalizePublish(noteData, overrides);
    if (!final.ok) return final;

    return {
      ok: true,
      data: {
        mode: "published",
        noteId,
        noteKey,
        publicUrl: `https://note.com/${userUrlname}/n/${noteKey}`,
        editUrl: `https://editor.note.com/notes/${noteKey}/edit`,
        hasPay: priceValue > 0,
      },
    };
  }

  window.NoteWeb = {
    markdownToHtml,
    uploadImage,
    uploadEyecatch,
    resolveMagazineId,
    getCurrentUser,
    createNoteSkeleton,
    saveDraft,
    publish,
  };
})();
