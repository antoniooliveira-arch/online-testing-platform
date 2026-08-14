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
} from "drizzle-orm/pg-core";

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
    score: numeric("score", { precision: 5, scale: 2 }),
    correctCount: integer("correct_count").notNull().default(0),
    totalMultiple: integer("total_multiple").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("submissions_exam_idx").on(t.examId),
    index("submissions_school_idx").on(t.school),
    index("submissions_class_idx").on(t.studentClass),
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
