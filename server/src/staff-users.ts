import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDb } from "./db.js";
import type { StaffRole } from "./http-guards.js";

export type StaffUser = {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type StaffRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  active: number;
  created_at: string;
  updated_at: string;
};

const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;

export function ensureStaffUsersTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_users_username ON staff_users(username);
  `);
}

function rowToUser(row: StaffRow): StaffUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === "clerk" ? "clerk" : "admin",
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeUsername(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function assertUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) {
    throw new Error("Usuário: 3–20 caracteres (letras minúsculas, números, . _ -)");
  }
  return username;
}

export function assertPassword(raw: string): string {
  const password = String(raw || "");
  if (password.length < 6) throw new Error("Senha precisa ter pelo menos 6 caracteres");
  if (password.length > 72) throw new Error("Senha longa demais");
  return password;
}

export function hasNamedOwner(): boolean {
  ensureStaffUsersTable();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM staff_users WHERE role = 'admin' AND active = 1")
    .get() as { c: number };
  return row.c > 0;
}

export function countActiveOwners(): number {
  ensureStaffUsersTable();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM staff_users WHERE role = 'admin' AND active = 1")
    .get() as { c: number };
  return row.c;
}

export function listStaffUsers(): StaffUser[] {
  ensureStaffUsersTable();
  const rows = getDb()
    .prepare(
      "SELECT id, username, display_name, password_hash, role, active, created_at, updated_at FROM staff_users ORDER BY created_at ASC",
    )
    .all() as StaffRow[];
  return rows.map(rowToUser);
}

export function getStaffUserById(id: string): StaffUser | null {
  ensureStaffUsersTable();
  const row = getDb()
    .prepare(
      "SELECT id, username, display_name, password_hash, role, active, created_at, updated_at FROM staff_users WHERE id = ?",
    )
    .get(id) as StaffRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getStaffUserByUsername(username: string): (StaffUser & { passwordHash: string }) | null {
  ensureStaffUsersTable();
  const row = getDb()
    .prepare(
      "SELECT id, username, display_name, password_hash, role, active, created_at, updated_at FROM staff_users WHERE username = ?",
    )
    .get(normalizeUsername(username)) as StaffRow | undefined;
  if (!row) return null;
  return { ...rowToUser(row), passwordHash: row.password_hash };
}

export function createStaffUser(input: {
  username: string;
  password: string;
  displayName: string;
  role: StaffRole;
}): StaffUser {
  ensureStaffUsersTable();
  const username = assertUsername(input.username);
  const password = assertPassword(input.password);
  const displayName = String(input.displayName || username).trim().slice(0, 80) || username;
  const role: StaffRole = input.role === "clerk" ? "clerk" : "admin";
  const existing = getStaffUserByUsername(username);
  if (existing) throw new Error("Esse usuário já existe");
  const now = new Date().toISOString();
  const id = `stf_${nanoid(12)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  getDb()
    .prepare(
      `INSERT INTO staff_users (id, username, display_name, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(id, username, displayName, passwordHash, role, now, now);
  return getStaffUserById(id)!;
}

export function updateStaffUser(
  id: string,
  input: { displayName?: string; password?: string; active?: boolean; role?: StaffRole },
): StaffUser {
  ensureStaffUsersTable();
  const current = getStaffUserById(id);
  if (!current) throw new Error("Funcionário não encontrado");
  const now = new Date().toISOString();
  let displayName = current.displayName;
  let role = current.role;
  let active = current.active;
  let passwordHash: string | null = null;

  if (input.displayName !== undefined) {
    displayName = String(input.displayName || "").trim().slice(0, 80);
    if (!displayName) throw new Error("Nome de exibição obrigatório");
  }
  if (input.role !== undefined) {
    role = input.role === "clerk" ? "clerk" : "admin";
  }
  if (input.active !== undefined) {
    active = Boolean(input.active);
  }
  if (input.password !== undefined && input.password !== "") {
    passwordHash = bcrypt.hashSync(assertPassword(input.password), 10);
  }

  const wouldBeOwner = role === "admin" && active;
  if (current.role === "admin" && current.active && !wouldBeOwner && countActiveOwners() <= 1) {
    throw new Error("Não dá para desativar ou rebaixar o último dono");
  }

  if (passwordHash) {
    getDb()
      .prepare(
        "UPDATE staff_users SET display_name = ?, role = ?, active = ?, password_hash = ?, updated_at = ? WHERE id = ?",
      )
      .run(displayName, role, active ? 1 : 0, passwordHash, now, id);
  } else {
    getDb()
      .prepare("UPDATE staff_users SET display_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?")
      .run(displayName, role, active ? 1 : 0, now, id);
  }
  return getStaffUserById(id)!;
}

export function verifyStaffPassword(username: string, password: string): StaffUser | null {
  const row = getStaffUserByUsername(username);
  if (!row || !row.active) return null;
  if (!bcrypt.compareSync(password, row.passwordHash)) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
