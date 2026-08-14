import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { answers, exams, questions, submissions, users } from "./schema";

const NAMES = [
  "Maria Eduarda Silva",
  "João Pedro Santos",
  "Ana Clara Oliveira",
  "Lucas Gabriel Souza",
  "Beatriz Costa Lima",
  "Gabriel Henrique Rocha",
  "Laura Fernanda Alves",
  "Pedro Henrique Martins",
  "Isabela Cristina Nunes",
  "Matheus Vinícius Castro",
  "Sofia Helena Barbosa",
  "Davi Lucca Cardoso",
  "Alice Vitória Mendes",
  "Miguel Augusto Teixeira",
  "Manuela Rosa Pinto",
  "Arthur César Freitas",
  "Heloísa Maria Ramos",
  "Bernardo Antunes Vieira",
  "Valentina Duarte Moraes",
  "Heitor Sampaio Lopes",
  "Cecília Prado Farias",
  "Théo Almeida Bastos",
  "Lívia Ferraz Pires",
  "Samuel Marques Sales",
  "Eduarda Correia Monteiro",
  "Rafael Nogueira Teles",
  "Yasmin Campos Azevedo",
  "Enzo Bezerra Xavier",
];

const SCHOOLS = ["E.E. Monteiro Lobato", "Colégio Dom Pedro II", "E.M. Paulo Freire"];
const CLASSES = ["9º ano A", "9º ano B", "8º ano A", "8º ano B"];

const ESSAY_TEXTS = [
  "Na minha opinião, o tema abordado mostra como pequenas atitudes podem mudar a sociedade. É importante refletir sobre nossas escolhas todos os dias.",
  "O texto trata de um assunto muito presente no nosso cotidiano. Acredito que a educação é o caminho para conscientizar as pessoas sobre esse tema.",
  "Eu entendi que o problema apresentado precisa de soluções coletivas. Cada um deve fazer a sua parte, começando dentro de casa e na escola.",
  "A leitura me fez pensar sobre responsabilidade e empatia. Um bom exemplo é o trabalho em equipe, que exige respeito e cooperação.",
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) {
    console.log("Seed: banco já populado, pulando.");
    return;
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const [admin] = await db
    .insert(users)
    .values([
      { name: "Administrador Geral", email: "admin@avalialab.com.br", passwordHash: hash("admin123"), role: "admin", school: "Secretaria de Educação" },
    ])
    .returning();
  const [ana] = await db
    .insert(users)
    .values([
      { name: "Ana Souza", email: "ana.souza@avalialab.com.br", passwordHash: hash("prof123"), role: "teacher", school: "E.E. Monteiro Lobato" },
    ])
    .returning();
  const [carlos] = await db
    .insert(users)
    .values([
      { name: "Carlos Lima", email: "carlos.lima@avalialab.com.br", passwordHash: hash("prof123"), role: "teacher", school: "Colégio Dom Pedro II" },
    ])
    .returning();

  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

  // ---------- Prova 1: Matemática (ativa, lista única) ----------
  const [mathExam] = await db
    .insert(exams)
    .values({
      title: "Avaliação de Matemática — 3º bimestre",
      description: "Leia cada questão com atenção. Use rascunho para os cálculos e envie ao final.",
      teacherId: ana.id,
      status: "active",
      deadline: days(7),
      targetClasses: "9º ano A, 9º ano B",
      displayMode: "list",
      slug: "MAT9B3M",
      publishedAt: hoursAgo(24 * 6),
    })
    .returning();

  const mathQuestions = [
    { prompt: "Quanto é **3 × (4 + 5)**?", options: ["27", "21", "17", "24"], correctIndex: 0 },
    { prompt: "Qual é o resultado de **12²**?", options: ["124", "144", "132", "120"], correctIndex: 1 },
    { prompt: "Se um triângulo tem base **10 cm** e altura **6 cm**, qual é a sua área?", options: ["60 cm²", "16 cm²", "30 cm²", "36 cm²"], correctIndex: 2 },
    { prompt: "Resolva a equação: **2x + 6 = 18**. Qual é o valor de x?", options: ["x = 12", "x = 6", "x = 3", "x = 9"], correctIndex: 1 },
    { prompt: "O que significa o número **π (pi)**?", options: ["A razão entre o perímetro e o raio de qualquer círculo", "A razão entre a circunferência e o diâmetro de qualquer círculo", "O dobro do raio de uma circunferência", "Um número inteiro usado em equações"], correctIndex: 1 },
    { prompt: "Qual fração é equivalente a **0,75**?", options: ["2/3", "1/4", "3/4", "7/10"], correctIndex: 2 },
    {
      prompt: "**Problema:** uma loja dá 20% de desconto em um produto de R$ 250,00. \n\nExplique passo a passo como você calcularia o preço final e qual o valor do desconto.",
      type: "essay",
      options: [],
      correctIndex: null,
    },
    {
      prompt: "Descreva com suas palavras a diferença entre *média aritmética* e *mediana*, dando um pequeno exemplo numérico.",
      type: "essay",
      options: [],
      correctIndex: null,
    },
  ];
  const mathQs = await db
    .insert(questions)
    .values(mathQuestions.map((q, i) => ({ examId: mathExam.id, prompt: q.prompt, type: q.type ?? "multiple", order: i, options: q.options, correctIndex: q.correctIndex })))
    .returning();

  // ---------- Prova 2: Ciências (ativa, página a página) ----------
  const [sciExam] = await db
    .insert(exams)
    .values({
      title: "Prova de Ciências — O Sistema Solar",
      description: "Responda as questões sobre os planetas e o universo. Boa sorte!",
      teacherId: carlos.id,
      status: "active",
      deadline: days(5),
      targetClasses: "8º ano A, 8º ano B",
      displayMode: "paged",
      slug: "CIEN8SOL",
      publishedAt: hoursAgo(24 * 4),
    })
    .returning();

  const sciQuestions = [
    { prompt: "Qual é o **maior planeta** do Sistema Solar?", options: ["Terra", "Saturno", "Júpiter", "Netuno"], correctIndex: 2 },
    { prompt: "Quantos planetas compõem o Sistema Solar?", options: ["7", "8", "9", "10"], correctIndex: 1 },
    { prompt: "Qual astro é a **fonte principal de luz e calor** do nosso sistema?", options: ["A Lua", "O Sol", "A Estrela Polar", "Marte"], correctIndex: 1 },
    { prompt: "O movimento de **rotação** da Terra é responsável por qual fenômeno?", options: ["As estações do ano", "O dia e a noite", "As fases da Lua", "Os eclipses"], correctIndex: 1 },
    { prompt: "Qual planeta é conhecido como **Planeta Vermelho**?", options: ["Vênus", "Júpiter", "Marte", "Mercúrio"], correctIndex: 2 },
  ];
  const sciQs = await db
    .insert(questions)
    .values(sciQuestions.map((q, i) => ({ examId: sciExam.id, prompt: q.prompt, type: "multiple", order: i, options: q.options, correctIndex: q.correctIndex })))
    .returning();

  // ---------- Prova 3: Redação (finalizada) ----------
  const [essayExam] = await db
    .insert(exams)
    .values({
      title: "Redação — Literatura Brasileira",
      description: "Produza um texto dissertativo sobre o papel da literatura na formação do cidadão.",
      teacherId: ana.id,
      status: "finished",
      deadline: hoursAgo(24 * 3),
      targetClasses: "9º ano A",
      displayMode: "list",
      slug: "RED9BR",
      publishedAt: hoursAgo(24 * 12),
    })
    .returning();
  const essayQs = await db
    .insert(questions)
    .values([
      {
        examId: essayExam.id,
        prompt: "Escreva um texto dissertativo de **10 a 15 linhas** sobre:\n\n- A importância da leitura na juventude\n- Como os clássicos brasileiros ajudam a entender o país\n- Conclua com sua opinião pessoal",
        type: "essay",
        order: 0,
        options: [],
        correctIndex: null,
      },
    ])
    .returning();

  // ---------- Rascunho ----------
  await db.insert(exams).values({
    title: "Quiz de História — Brasil Colônia",
    description: "Quiz rápido para revisão antes da prova principal.",
    teacherId: carlos.id,
    status: "draft",
    deadline: days(10),
    targetClasses: "8º ano A",
    displayMode: "paged",
    slug: null,
  });

  // ---------- Submissões fictícias ----------
  const rng = mulberry32(42);

  async function seedSubmissions(
    examId: number,
    qs: { id: number; type: string; correctIndex: number | null }[],
    count: number,
    classPool: string[]
  ) {
    for (let i = 0; i < count; i++) {
      const name = NAMES[Math.floor(rng() * NAMES.length)];
      const studentClass = classPool[Math.floor(rng() * classPool.length)];
      const school = SCHOOLS[Math.floor(rng() * SCHOOLS.length)];

      const mcQuestions = qs.filter((q) => q.type !== "essay");
      let correctCount = 0;
      const answerRows: { questionId: number; selectedIndex: number | null; essayText: string | null; isCorrect: boolean | null }[] = [];

      for (const q of qs) {
        if (q.type === "essay") {
          answerRows.push({
            questionId: q.id,
            selectedIndex: null,
            essayText: ESSAY_TEXTS[Math.floor(rng() * ESSAY_TEXTS.length)],
            isCorrect: null,
          });
        } else {
          const isCorrect = rng() < 0.68;
          const optionsCount = 4;
          let selected: number;
          if (isCorrect) selected = q.correctIndex as number;
          else {
            do {
              selected = Math.floor(rng() * optionsCount);
            } while (selected === q.correctIndex);
          }
          if (isCorrect) correctCount += 1;
          answerRows.push({ questionId: q.id, selectedIndex: selected, essayText: null, isCorrect });
        }
      }

      const totalMultiple = mcQuestions.length;
      const score = totalMultiple > 0 ? Math.round((correctCount / totalMultiple) * 1000) / 100 : null;

      const [sub] = await db
        .insert(submissions)
        .values({
          examId,
          studentName: name,
          studentClass,
          school,
          score: score === null ? null : String(score),
          correctCount,
          totalMultiple,
          submittedAt: hoursAgo(Math.floor(rng() * 24 * 6)),
        })
        .returning();

      await db.insert(answers).values(answerRows.map((r) => ({ submissionId: sub.id, ...r })));
    }
  }

  await seedSubmissions(mathExam.id, mathQs, 26, ["9º ano A", "9º ano B"]);
  await seedSubmissions(sciExam.id, sciQs, 18, ["8º ano A", "8º ano B"]);
  await seedSubmissions(essayExam.id, essayQs, 9, ["9º ano A"]);

  console.log("Seed concluído:");
  console.log("  • admin@avalialab.com.br / admin123");
  console.log("  • ana.souza@avalialab.com.br / prof123");
  console.log("  • carlos.lima@avalialab.com.br / prof123");
  console.log("  • Prova aluno (Matemática): /prova/MAT9B3M");
  console.log("  • Prova aluno (Ciências): /prova/CIEN8SOL");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
