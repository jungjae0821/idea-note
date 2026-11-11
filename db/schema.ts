import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 로그인 대신 브라우저마다 만든 익명 ID(owner_id)로 기록 주인을 구분한다.
export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    topic: text("topic").notNull(),
    constraints: text("constraints").notNull().default(""),
    categoryId: text("category_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    modelId: text("model_id").notNull(),
    createdAt: text("created_at").notNull(),
    savedAt: text("saved_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("ideas_owner_created_idx").on(t.ownerId, t.createdAt, t.id)],
);
