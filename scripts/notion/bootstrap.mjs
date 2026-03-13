import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const notionToken = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const notionVersion = process.env.NOTION_VERSION || "2022-06-28";

if (!notionToken) {
  console.error("Missing NOTION_TOKEN");
  process.exit(1);
}

if (!parentPageId) {
  console.error("Missing NOTION_PARENT_PAGE_ID");
  process.exit(1);
}

const specPath = resolve(process.cwd(), "scripts/notion/databases.spec.json");
const outputPath = resolve(process.cwd(), "scripts/notion/databases.created.json");

const spec = JSON.parse(readFileSync(specPath, "utf-8"));
const created = {
  createdAt: new Date().toISOString(),
  parentPageId,
  results: []
};

for (const db of spec.databases) {
  const properties = {};

  for (const [propName, prop] of Object.entries(db.properties)) {
    properties[propName] = toNotionProperty(prop);
  }

  const payload = {
    parent: { type: "page_id", page_id: normalizeId(parentPageId) },
    title: [
      {
        type: "text",
        text: { content: db.title }
      }
    ],
    description: [
      {
        type: "text",
        text: { content: db.description || "" }
      }
    ],
    properties
  };

  const response = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json();

  if (!response.ok) {
    console.error(`Failed creating DB ${db.key}:`, json);
    process.exit(1);
  }

  console.log(`Created DB: ${db.title} (${json.id})`);
  created.results.push({
    key: db.key,
    title: db.title,
    id: json.id,
    url: json.url
  });
}

writeFileSync(outputPath, JSON.stringify(created, null, 2));
console.log(`\nSaved created DB map to ${outputPath}`);

function normalizeId(value) {
  return String(value).replace(/-/g, "");
}

function toNotionProperty(prop) {
  switch (prop.type) {
    case "title":
      return { title: {} };
    case "rich_text":
      return { rich_text: {} };
    case "number":
      return { number: {} };
    case "email":
      return { email: {} };
    case "url":
      return { url: {} };
    case "date":
      return { date: {} };
    case "people":
      return { people: {} };
    case "status":
      return {
        status: {
          options: (prop.options || []).map((name) => ({ name }))
        }
      };
    case "select":
      return {
        select: {
          options: (prop.options || []).map((name) => ({ name }))
        }
      };
    case "multi_select":
      return {
        multi_select: {
          options: (prop.options || []).map((name) => ({ name }))
        }
      };
    default:
      throw new Error(`Unsupported property type: ${prop.type}`);
  }
}
