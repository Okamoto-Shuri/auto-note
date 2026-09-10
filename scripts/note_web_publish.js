/**
 * note.com 非公式・内部APIを直接叩いて記事を投稿するためのブラウザ実行スクリプト。
 *
 * 前提:
 * - note.com にログイン済みの専用Chromeタブ上で実行する。
 * - Playwright によるヘッドレス自動ログインは行わない（note.com 側のボット検知で
 *   ブロックされることが確認されているため）。認証はユーザー本人が手動ログイン
 *   したブラウザセッションの Cookie にすべて委ねる。
 * - CSRF対策の `XSRF-TOKEN` Cookie の値のみを最小スコープで読み取り、API呼び出しの
 *   `X-XSRF-TOKEN` ヘッダーに設定する用途にだけ使う。セッションCookie等、認証情報
 *   そのものに相当するCookieには一切アクセスしない。
 *
 * 使い方（note_publisher MCPがChrome DevTools Protocol経由で実行する想定）:
 *   1. 本ファイルの内容をそのまま実行し、`window.NoteWeb` を定義する。
 *   2. `await NoteWeb.publish({ title, markdown, images, eyecatch, hashtags, price,
 *      magazineKeys, isPublish })` を呼び出す。images / eyecatch はローカル画像を
 *      base64 化して渡す（ブラウザJSはローカルファイルパスを直接読めないため）。
 *
 * 実装範囲について:
 * このファイルは「自分の記事を書いて投稿・管理する」という本プロジェクトの目的に
 * 沿う内部APIのみを実装する。note の内部APIには他にも多数のエンドポイントが
 * 存在するが（例: https://note.com/marie_222/n/n6a10366298b0 に整理されている
 * ログイン・いいね・フォロー・コメント投稿・メンバーシップ/掲示板の作成運用など）、
 * 以下は意図的に実装しない。
 * - メール+パスワードでの自動ログイン（`POST /api/v1/sessions/sign_in`）:
 *   note.com のボット検知でヘッドレス自動ログインが拒否されることを確認済みであり、
 *   認証は常にユーザー本人の手動ログイン済みブラウザセッションに委ねる設計のため。
 * - いいね・フォロー・コメント投稿/編集/削除など他人のコンテンツに書き込む系API:
 *   自分の記事投稿という目的の範囲外で、自動化するとスパム的操作になり得るため。
 * - メンバーシップ(Circle)・掲示板(Board)の作成/運用系API:
 *   記事の執筆・投稿とは別のコミュニティ/マネタイズ機能であり、現状の用途外のため。
 *
 * `unpublishNote` / `deleteNote` / `deleteDraft` は取り消しが効かない、または
 * 効きにくい破壊的操作なので、呼び出し側は実行前に必ずユーザーの明示確認を取ること
 * （`isPublish: true` の公開と同様の扱い）。
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

  async function apiDelete(url) {
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(),
    });
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
    form.append("width", "1280");
    form.append("height", "670");

    const res = await fetch("https://note.com/api/v1/image_upload/note_eyecatch", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const result = await finishResponse(res);
    // note may return HTTP 201 even when the JSON body contains a validation
    // error, so checking the status code alone can report a false success.
    if (!result.ok || result.json?.error) {
      return { ok: false, error: { type: "EyecatchUploadFailed", status: result.status, detail: result.text } };
    }
    const url = result.json?.data?.url;
    if (!url) {
      return { ok: false, error: { type: "EyecatchUploadResultInvalid", status: result.status, detail: result.text } };
    }
    return { ok: true, data: { uploaded: true, url } };
  }

  // ---- マガジン ----

  async function getMyMagazines() {
    const result = await apiGet("https://note.com/api/v1/my/magazines");
    if (!result.ok || !result.json) {
      return { ok: false, error: { type: "MyMagazinesFetchFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: result.json.data || result.json };
  }

  async function getMagazineByKey(magazineKey) {
    const result = await apiGet(`https://note.com/api/v1/magazines/${magazineKey}`);
    if (!result.ok || !result.json || !result.json.data) {
      return { ok: false, error: { type: "MagazineFetchFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: result.json.data };
  }

  // 旧実装（マガジンページのHTMLに埋め込まれたJSONからidを正規表現で抜く方式）。
  // 正規API (`getMagazineByKey`) が想定外の形で失敗した場合のフォールバックとして残す。
  async function resolveMagazineIdViaHtml(userUrlname, magazineKey) {
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

  async function resolveMagazineId(userUrlname, magazineKey) {
    if (!magazineKey) return { ok: true, data: { magazineId: null } };
    const viaApi = await getMagazineByKey(magazineKey);
    if (viaApi.ok && viaApi.data && viaApi.data.id) {
      return { ok: true, data: { magazineId: viaApi.data.id } };
    }
    return resolveMagazineIdViaHtml(userUrlname, magazineKey);
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
    if (!result.ok || result.json?.error) {
      return { ok: false, error: { type: "DraftSaveFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  async function tempSaveForPublish(noteId, title, combinedHtml) {
    const result = await apiPost(
      `https://note.com/api/v1/text_notes/draft_save?id=${noteId}&is_temp_saved=true`,
      { body: combinedHtml, name: title, index: true }
    );
    if (!result.ok || result.json?.error) {
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
    if (!result.ok || result.json?.error) {
      return { ok: false, error: { type: "PublishFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  // ---- 既存記事の取得（リライト・確認用） ----

  async function getNote(noteKey, opts) {
    opts = opts || {};
    const params = new URLSearchParams();
    if (opts.draft) params.set("draft", "true");
    if (opts.draftReedit !== undefined) params.set("draft_reedit", String(opts.draftReedit));
    const qs = params.toString();
    const result = await apiGet(`https://note.com/api/v3/notes/${noteKey}${qs ? "?" + qs : ""}`);
    if (!result.ok || !result.json || !result.json.data) {
      return { ok: false, error: { type: "GetNoteFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: result.json.data };
  }

  // ---- 下書き・公開記事の取り消し系（破壊的操作。呼び出し前に必ずユーザー確認を取ること） ----

  async function deleteDraft(noteId) {
    const result = await apiDelete(`https://note.com/api/v1/text_notes/draft_delete?id=${noteId}`);
    if (!result.ok) {
      return { ok: false, error: { type: "DeleteDraftFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  // 公開済み記事を下書きに差し戻す。有料記事・販売実績あり・メンバーシップ/マガジン
  // 紐付きの記事は note 側の制約で 403 になる（記事側の解説記事に記載の既知の制限）。
  async function unpublishNote(noteKey) {
    const result = await apiPost(`https://note.com/api/v2/notes/${noteKey}/change_status`, { status: "draft" });
    if (!result.ok) {
      return { ok: false, error: { type: "UnpublishFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  // 公開済み記事のソフトデリート。取り消し不可な破壊的操作。
  async function deleteNote(noteId) {
    const result = await apiDelete(`https://note.com/api/v1/notes/${noteId}`);
    if (!result.ok) {
      return { ok: false, error: { type: "DeleteNoteFailed", status: result.status, detail: result.text } };
    }
    return { ok: true };
  }

  // ---- 添付ファイル・note内埋め込み ----

  async function uploadAttachment(base64, filename, mime, noteKey) {
    const form = new FormData();
    form.append("file", base64ToBlob(base64, mime), filename);
    form.append("file_name", filename);
    form.append("note_key", noteKey);

    const res = await fetch("https://note.com/api/v2/attachments/upload", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const result = await finishResponse(res);
    const attachmentKey = result.json && result.json.data && result.json.data.attachment_key;
    if (!result.ok || !attachmentKey) {
      return { ok: false, error: { type: "AttachmentUploadFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: { attachmentKey } };
  }

  // 自分の別記事などを note 記事として本文中にネイティブ埋め込みする。
  // embeddableKey は埋め込み対象記事の key（n... 形式）。
  async function embedNote(embeddableKey, height) {
    const form = new FormData();
    form.append("url", `https://note.com/notes/${embeddableKey}`);
    form.append("height", String(height || 211));
    form.append("embeddable_type", "Note");
    form.append("embeddable_key", embeddableKey);

    const res = await fetch("https://note.com/api/v1/embed", {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const result = await finishResponse(res);
    const embedKey =
      result.json && result.json.data && result.json.data.embedded_content && result.json.data.embedded_content.key;
    if (!result.ok || !embedKey) {
      return { ok: false, error: { type: "EmbedFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: { embedKey } };
  }

  // ---- 自分の記事のPV統計（ネタ選定・成果記録用） ----

  async function getPvStats(opts) {
    opts = opts || {};
    const params = new URLSearchParams({
      filter: opts.filter || "all",
      page: String(opts.page || 1),
      sort: opts.sort || "pv",
    });
    const result = await apiGet(`https://note.com/api/v1/stats/pv?${params.toString()}`);
    if (!result.ok || !result.json) {
      return { ok: false, error: { type: "PvStatsFetchFailed", status: result.status, detail: result.text } };
    }
    return { ok: true, data: result.json.data || result.json };
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

  async function publishSteps(opts, progress) {
    const {
      title,
      markdown,
      images, // [{ path, base64, mime }] 省略可
      eyecatch, // { base64, mime } 省略可
      hashtags, // string[] 省略可
      price, // number 省略可（既定 0）
      magazineKeys, // string[] 省略可
      isPublish, // boolean。スキル側の既定は本公開だが、この関数で省略すると false（下書き）
    } = opts;

    const priceValue = price || 0;
    const hashtagList = hashtags || [];
    const magazineKeyList = magazineKeys || [];

    // 1) 画像を先にアップロードして参照解決マップを作る
    if (images?.length) progress.started = true;
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
    progress.started = true;
    const created = await createNoteSkeleton();
    if (!created.ok) return created;
    const noteData = created.data;
    const noteId = noteData.id;
    const noteKey = noteData.key;
    progress.note = {
      noteId, noteKey,
      publicUrl: `https://note.com/${userUrlname}/n/${noteKey}`,
      editUrl: `https://editor.note.com/notes/${noteKey}/edit`,
    };
    if (!noteId || !noteKey) return { ok: false, error: { type: "InvalidCreatedNote" } };

    // 6) アイキャッチ
    if (eyecatch) {
      const eye = await uploadEyecatch(eyecatch.base64, eyecatch.mime, noteId);
      if (!eye.ok) return eye;
    }

    // 7) 下書き保存のみ
    if (!isPublish) {
      const draft = await saveDraft(noteId, title, combinedHtml, imageKeys);
      if (!draft.ok) return draft;
      const checked = await verifySavedNote(noteId, noteKey, false);
      if (!checked.ok) return checked;
      return {
        ok: true,
        data: {
          mode: "draft",
          noteId,
          noteKey,
          editUrl: `https://editor.note.com/notes/${noteKey}/edit`,
          verification: checked.data,
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
    const checked = await verifySavedNote(noteId, noteKey, true);
    if (!checked.ok) return checked;

    return {
      ok: true,
      data: {
        mode: "published",
        noteId,
        noteKey,
        publicUrl: `https://note.com/${userUrlname}/n/${noteKey}`,
        editUrl: `https://editor.note.com/notes/${noteKey}/edit`,
        hasPay: priceValue > 0,
        verification: checked.data,
      },
    };
  }

  async function verifySavedNote(noteId, noteKey, isPublish) {
    const result = await getNote(noteKey, isPublish ? {} : { draft: true });
    if (!result.ok) return result;
    const data = result.data;
    const identityMatches = String(data.id) === String(noteId) && data.key === noteKey;
    const published = data.status === "published" || data.is_published === true;
    const draft = data.status === "draft" || data.is_published === false;
    const eyecatchUrl = typeof data.eyecatch === "string" ? data.eyecatch : data.eyecatch?.url;
    const validImage = typeof eyecatchUrl === "string" && /^https?:\/\//.test(eyecatchUrl);
    if (!identityMatches || (isPublish ? !published || draft : !draft || published) || !validImage) {
      return { ok: false, error: { type: "NoteVerificationFailed", detail: {
        identityMatches, status: data.status, is_published: data.is_published, eyecatchUrl,
      } } };
    }
    return { ok: true, data: { saved: true, published, eyecatchUrl, checkedAt: new Date().toISOString() } };
  }

  async function publish(opts) {
    const progress = { started: false, note: null };
    try {
      const result = await publishSteps(opts, progress);
      if (!result.ok) return { ...result, doNotRetry: progress.started, note: progress.note };
      return result;
    } catch (error) {
      return { ok: false, doNotRetry: progress.started, note: progress.note,
        error: { type: "NoteOperationInterrupted", message: error.message } };
    }
  }

  window.NoteWeb = {
    markdownToHtml,
    uploadImage,
    uploadEyecatch,
    resolveMagazineId,
    getMyMagazines,
    getMagazineByKey,
    getCurrentUser,
    createNoteSkeleton,
    saveDraft,
    publish,
    getNote,
    deleteDraft,
    unpublishNote,
    deleteNote,
    uploadAttachment,
    embedNote,
    getPvStats,
  };
})();
