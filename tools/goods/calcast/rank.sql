-- monthly_tips_run.py の SQL_SC / SQL_DN と monthly_tips.merge / rank を、月ごとに BigQuery の中で写したもの
WITH
periods AS (
  SELECT FORMAT_DATE('%Y-%m', m) AS p, m AS d0, LAST_DAY(m) AS d1
  FROM UNNEST(GENERATE_DATE_ARRAY('2025-11-01', '2026-10-01', INTERVAL 1 MONTH)) m
  UNION ALL SELECT '2026-09c', DATE '2026-08-29', DATE '2026-09-25'
),
snap AS (SELECT MAX(taken_at) m FROM `live-streaming-d3cac.island_backup.firestore_docs` WHERE collection='islandCharacter'),
chx AS (
  SELECT doc_id AS id,
         IFNULL(JSON_VALUE(doc_json, '$.channelId'), '') AS cid,
         IFNULL(JSON_VALUE(doc_json, '$.channelName'), '') AS cname,
         JSON_VALUE_ARRAY(doc_json, '$.lookupKeys') AS keys
  FROM `live-streaming-d3cac.island_backup.firestore_docs`, snap
  WHERE collection='islandCharacter' AND taken_at = snap.m
),
by_cid AS (SELECT cid, ANY_VALUE(id) id, COUNT(*) n FROM chx WHERE cid != '' GROUP BY cid),
by_key AS (SELECT k, ANY_VALUE(id) id, COUNT(*) n FROM chx, UNNEST(keys) k WHERE k != '' GROUP BY k),
sc AS (
  SELECT p.p, author_channel_id AS cid, ANY_VALUE(author_name) AS handle,
         SUM(SAFE_CAST(REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64)) AS yen
  FROM `live-streaming-d3cac.youtube_chat.chat_messages` c JOIN periods p
    ON DATE(c.published_at, 'Asia/Tokyo') BETWEEN p.d0 AND p.d1
  WHERE event_type = 'PAID' AND author_channel_id IS NOT NULL AND STARTS_WITH(purchase_amount_text, '¥')
  GROUP BY p.p, cid
),
dn0 AS (
  SELECT p.p, donation_id, ANY_VALUE(donor_name) AS donor_name, ANY_VALUE(CAST(amount AS INT64)) AS yen
  FROM `live-streaming-d3cac.youtube_chat.doneru_donations` d JOIN periods p
    ON DATE(d.donated_at, 'Asia/Tokyo') BETWEEN p.d0 AND p.d1
  WHERE donated_at IS NOT NULL
  GROUP BY p.p, donation_id
),
dn AS (
  SELECT p, IFNULL(donor_name, '') AS name, SUM(yen) AS yen FROM dn0 GROUP BY p, name
),
dnk AS (
  SELECT p, name, yen,
    LOWER(REGEXP_REPLACE(REGEXP_REPLACE(
      REGEXP_REPLACE(NORMALIZE(name, NFKC), r'[\x{FE00}-\x{FE0F}\x{200B}-\x{200F}\x{2060}\x{FEFF}]', ''),
      r'^[\s\p{Z}]+|[\s\p{Z}]+$', ''), r'[\s\p{Z}]+', ' ')) AS nk
  FROM dn
),
rows_ AS (
  SELECT s.p, IF(b.n = 1, b.id, NULL) AS chr,
         IF(b.n = 1, CONCAT('c:', b.id), CONCAT('s:', s.cid)) AS k,
         IFNULL(s.handle, '') AS handle, '' AS dname, s.yen AS sc, 0 AS dnv, 0 AS src
  FROM sc s LEFT JOIN by_cid b ON b.cid = s.cid
  UNION ALL
  SELECT d.p, IF(b.n = 1, b.id, NULL),
         IF(b.n = 1, CONCAT('c:', b.id), CONCAT('d:', IF(d.nk = '', d.name, d.nk))),
         '', d.name, 0, d.yen, 1
  FROM dnk d LEFT JOIN by_key b ON b.k = d.nk
),
merged AS (
  SELECT p, k, ANY_VALUE(chr) AS chr,
         SUM(sc) AS sc, SUM(dnv) AS dn,
         ARRAY_AGG(IF(src = 0, handle, dname) ORDER BY src LIMIT 1)[OFFSET(0)] AS first_name
  FROM rows_ GROUP BY p, k
),
scored AS (
  SELECT m.p, m.chr, COALESCE(NULLIF(c.cname, ''), m.first_name) AS display,
         DIV(m.sc, 2) + m.dn AS yen, m.sc > 0 AS has_sc, m.dn > 0 AS has_dn
  FROM merged m LEFT JOIN chx c ON c.id = m.chr
),
ranked AS (
  SELECT p, chr, display, has_sc, has_dn, yen,
         RANK() OVER (PARTITION BY p ORDER BY yen DESC) AS rk,
         ROW_NUMBER() OVER (PARTITION BY p ORDER BY yen DESC, display) AS rn,
         ROUND(100 * yen / MAX(yen) OVER (PARTITION BY p)) AS idx,
         COUNT(*) OVER (PARTITION BY p) AS people
  FROM scored WHERE yen > 0
)
SELECT p, rk, rn, display, chr, CAST(idx AS INT64) idx, has_sc, has_dn, people
FROM ranked WHERE rn <= 7
ORDER BY p, rn
