export const hostedStateSchema = {
  table: "app_state",
  primaryKey: "id",
  columns: {
    id: "INTEGER PRIMARY KEY CHECK (id = 1)",
    data: "TEXT NOT NULL",
    updatedAt: "INTEGER NOT NULL DEFAULT 0",
  },
} as const;
