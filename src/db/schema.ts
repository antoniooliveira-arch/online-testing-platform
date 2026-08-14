import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ============================================================
 * BANCO ESCOLAR (tabelas criadas via SQL — ver sql/banco-escolar-*.sql)
 * ============================================================ */

/** Escolas da rede. */
export const escolas = pgTable("escolas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  codigo: integer("codigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Turmas de uma escola (ano letivo, turno e professor). */
export const turmas = pgTable(
  "turmas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escolaId: uuid("escola_id")
      .notNull()
      .references(() => escolas.id, { onDelete: "cascade" }),
    codigo: integer("codigo"),
    nome: text("nome").notNull(),
    ano: text("ano").notNull(),
    turno: text("turno").notNull(),
    professor: text("professor"),
    professorCodigo: integer("professor_codigo"),
    anoLetivo: integer("ano_letivo").notNull().default(2026),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("turmas_escola_idx").on(t.escolaId)]
);

/** Alunos (único registro por pessoa, sem turma). */
export const alunos = pgTable("alunos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  matricula: text("matricula"),
  numeroChamada: integer("numero_chamada"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Matrículas: liga o aluno à turma em um ano letivo. */
export const matriculas = pgTable(
  "matriculas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alunoId: uuid("aluno_id")
      .notNull()
      .references(() => alunos.id, { onDelete: "cascade" }),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => turmas.id, { onDelete: "cascade" }),
    anoLetivo: integer("ano_letivo").notNull(),
    status: text("status").notNull().default("ativo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("matriculas_aluno_turma_ano_idx").on(t.alunoId, t.turmaId, t.anoLetivo)]
);

export type Escola = typeof escolas.$inferSelect;
export type Turma = typeof turmas.$inferSelect;
export type Aluno = typeof alunos.$inferSelect;
export type Matricula = typeof matriculas.$inferSelect;

/* ============================================================ */

/** Usuários internos (professores e administradores). Alunos não têm cadastro. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("teacher"), // "admin" | "teacher"
  school: text("school"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Provas criadas pelos professores. */
export const exams = pgTable(
  "exams",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("draft"), // "draft" | "active" | "finished"
    deadline: timestamp("deadline", { withTimezone: true }),
    targetClasses: text("target_classes").notNull().default(""),
    displayMode: text("display_mode").notNull().default("list"), // "list" | "paged"
    slug: text("slug").unique(), // código/link de acesso gerado ao publicar
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("exams_teacher_idx").on(t.teacherId), index("exams_status_idx").on(t.status)]
);

/** Questões de uma prova. */
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    type: text("type").notNull().default("multiple"), // "multiple" | "essay"
    order: integer("order").notNull().default(0),
    options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    correctIndex: integer("correct_index"),
  },
  (t) => [index("questions_exam_idx").on(t.examId)]
);

/** Submissão de um aluno (prova respondida). */
export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentName: text("student_name").notNull(),
    studentClass: text("student_class").notNull(),
    school: text("school").notNull(),
    alunoId: uuid("aluno_id").references(() => alunos.id, { onDelete: "set null" }),
    turmaId: uuid("turma_id").references(() => turmas.id, { onDelete: "set null" }),
    score: numeric("score", { precision: 5, scale: 2 }),
    correctCount: integer("correct_count").notNull().default(0),
    totalMultiple: integer("total_multiple").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("submissions_exam_idx").on(t.examId),
    index("submissions_school_idx").on(t.school),
    index("submissions_class_idx").on(t.studentClass),
    index("submissions_aluno_idx").on(t.alunoId),
    index("submissions_turma_idx").on(t.turmaId),
  ]
);

/** Respostas individuais de uma submissão. */
export const answers = pgTable(
  "answers",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    selectedIndex: integer("selected_index"),
    essayText: text("essay_text"),
    isCorrect: boolean("is_correct"),
  },
  (t) => [uniqueIndex("answers_submission_question_idx").on(t.submissionId, t.questionId)]
);

export type User = typeof users.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
