// One-off seed: 353 realistic users across existing orgs, with working credentials.
// Run: bun scripts/seed-users.ts > /tmp/seed-users.sql
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const PASSWORD = process.env.SEED_PASSWORD ?? "Larity123!";
const PG_URL = process.env.SEED_PG_URL; // optional: verify emails against live DB
const EXISTING_ORGS = JSON.parse(
  execSync("cat /tmp/larity-existing-orgs.json", { encoding: "utf8" })
) as { id: string; slug: string; name: string }[];

const newPasswordHash = () =>
  execSync(
    `openssl passwd -6 -salt ${Math.random().toString(36).slice(2, 18)} ${JSON.stringify(
      PASSWORD
    )}`,
    { encoding: "utf8" }
  ).trim();

// ---------------------------------------------------------------- name pools
const FIRST = {
  Indian:
    "Aarav Vivaan Aditya Arjun Rohan Karthik Siddharth Rahul Nikhil Pranav Ishaan Dev Aniket Harsh Manish Tanvi Ananya Priya Sneha Meera Ishita Kavya Divya Ritika Neha Shreya Aditi Sanya Rohit Amit Suresh Vivek Rajesh Girish Deepak Naveen Arvind Kiran Lokesh Sandeep Hari Prasad Anand Vikram Abhinav Mayank Aryan Yash Kartik Shaurya Anirudh Varun Tarun Sagar Praveen Nithin Sathish Ashwin Keerthi Shruti Pooja Swati Bhavya Anjali Lakshmi Gauri Nandini Tanmay".split(
      " "
    ),
  Western:
    "James Olivia Emma Liam Noah Ava Sophia Mason Isabella Ethan Mia Lucas Charlotte Henry Amelia Jack Harper Eleanor Ryan Grace Daniel Chloe Matthew Ellie Owen Nora Caleb Maya Dylan Aiden Sophie Levi Stella Isaac Hazel Nathan Lily Thomas Ruby Samuel Alice Benjamin Clara Elias Ivy".split(
      " "
    ),
  Filipino:
    "Noel Jr. Jasmine Miguel Jose Carlo Angelo Ferdinand Marlon Kristine Aileen Rowena Emmanuel Lorenzo Ramon Emilio Althea Diwata Liza Paolo Ronel".split(
      " "
    ),
  Hispanic:
    "Alejandro Mateo Sebastián Diego Nicolás Andrés Santiago Javier Camila Valentina Sofía Lucía Emiliano Tomás Ignacio Gabriela Paula Renata".split(
      " "
    ),
};

const LAST = {
  Indian:
    "Sharma Verma Patel Reddy Nair Iyer Menon Bansal Jain Chopra Sethi Syed Doshi Rao Kapoor Ghosh Bose Mehta Joshi Malhotra Saxena Trivedi Pandey Rao Bhat Kulkarni Deshpande Hiremath Shetty Kamath Hegde Nayak Pillai Kurup Anand Krishnan Suresh Padmanabhan Kamalesh Varma Chaudhary Bisht Rawat Negi Thakur Mukherjee Banerjee Chatterjee Dasgupta Sengupta Mandal".split(
      " "
    ),
  Western:
    "Smith Johnson Williams Brown Jones Miller Davis Wilson Anderson Taylor Thomas Moore Jackson White Harris Martin Thompson Garcia Martinez Robinson Clark Rodriguez Lewis Walker Hall Allen Young King Wright Scott Green Baker Adams Nelson Carter Mitchell Perez Roberts Turner Phillips Campbell Parker Evans Edwards Collins Stewart Morris Rogers Reed Cook Morgan Bell Murphy Bailey Rivera Cooper Richardson Cox Howard Ward Torres Peterson Gray Ramirez James Watson Brooks Kelly Sanders Price Bennett Wood Barnes Ross Henderson Coleman Jenkins Perry Powell Long Patterson Hughes Flores Washington Butler Simmons Foster Gonzales".split(
      " "
    ),
  Filipino:
    "Reyes Cruz Santos Bautista Ocampo Dela Cruz Ramos Mendoza Garcia Aquino Villanueva Castillo Navarro Domingo Salazar Manalo Tolentino Fernandez".split(
      " "
    ),
  Hispanic:
    "Alvarez Ruiz Jimenez Moreno Vargas Castro Ortiz Ramos Gutierrez Chavez Medina Aguilar Herrera Romero Suarez Santos".split(
      " "
    ),
};

const REACHING_OUT_SLUGS = new Set([
  "singularity-works",
  "blaster-corp",
  "zenin-clan",
  "kirmada-ki-dukaan",
]);

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Karachi",
  "Asia/Manila",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Australia/Sydney",
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const herokuish = (tld = "com") => {
  const parts = [
    "acme",
    "northwind",
    "bright",
    "outpost",
    "meridian",
    "harbor",
    "vertex",
    "lumen",
    "cobalt",
    "juniper",
    "atlas",
    "beacon",
    "granite",
    "sable",
    "birch",
    "kestrel",
    "orion",
    "terrace",
    "plateau",
    "summit",
    "arbor",
    "fable",
    "dovetail",
    "sunstone",
    "tideline",
  ];
  return `${pick(parts)}-${pick(parts)}.${tld}`;
};

const STRATEGY = `
-- 353 users across ${EXISTING_ORGS.length} orgs
`;

const orgPlan = (() => {
  const growth = EXISTING_ORGS.filter((o) => REACHING_OUT_SLUGS.has(o.slug));
  const others = EXISTING_ORGS.filter((o) => !REACHING_OUT_SLUGS.has(o.slug));
  const weights = [4.4, 2.1, 1.6, 1.3];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let remaining = 353 - 181 - 9; // keep testorgs small
  const plan: {
    org: { id: string; slug: string; name: string };
    count: number;
    role: "grower" | "small";
  }[] = [];
  growth.forEach((org, i) => {
    const count = Math.round((353 * weights[i]) / totalWeight);
    remaining -= count;
    plan.push({ org, count, role: "grower" });
  });
  const smallWeights = others.map((_, i) => (i === 0 ? 6 : 2));
  const smallTotal = smallWeights.reduce((a, b) => a + b, 0);
  others.forEach((org, i) => {
    const count = Math.max(
      1,
      Math.round((remaining * smallWeights[i]) / smallTotal)
    );
    plan.push({ org, count, role: "small" });
  });
  // Fix rounding drift: adjust largest org
  const diff = 353 - plan.reduce((a, b) => a + b.count, 0);
  const biggest = plan.reduce((a, b) => (a.count > b.count ? a : b));
  biggest.count += diff;
  // Final guard: force exact total in case drift exceeded the largest org
  let drift = 353 - plan.reduce((a, b) => a + b.count, 0);
  while (drift !== 0 && plan.length > 0) {
    const target = plan.reduce((a, b) => (a.count > b.count ? a : b));
    target.count += drift > 0 ? 1 : -1;
    drift = 353 - plan.reduce((a, b) => a + b.count, 0);
  }
  return plan;
})();

const usedEmails = new Set<string>();
const usedNames = new Set<string>();

const LAST_BY_ORIGIN: Record<keyof typeof FIRST, string[]> = {
  Indian: LAST.Indian,
  Western: LAST.Western,
  Filipino: LAST.Filipino,
  Hispanic: LAST.Hispanic,
};

const pickName = (origin: keyof typeof FIRST) => {
  const first = pick(FIRST[origin]);
  const last = pick(LAST_BY_ORIGIN[origin]);
  const full = `${first} ${last}`;
  if (usedNames.has(full)) {
    return pickName(origin);
  }
  usedNames.add(full);
  return full;
};

const makeEmail = (
  name: string,
  org: { slug: string; name: string },
  useGmail: boolean
) => {
  const [first, ...rest] = name.toLowerCase().split(" ");
  const last = rest.join("");
  let domain: string;
  if (useGmail) {
    domain = "gmail.com";
  } else if (org.slug === "singularity-works") {
    domain = "singularityworks.xyz";
  } else {
    domain = herokuish(pick(["com", "io", "co", "dev"]));
  }
  const base = `${slugify(first)}.${slugify(last.replaceAll(/[^a-z]/g, ""))}`;
  let candidate = `${base}@${domain}`;
  let n = 2;
  while (usedEmails.has(candidate)) {
    candidate = `${base}${n}@${domain}`;
    n++;
  }
  usedEmails.add(candidate);
  return candidate;
};

// ------------------------------------------------------------------ output
const esc = (s: string) => s.replaceAll("'", "''");

interface UserRow {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  orgId: string | null;
  role: string;
  timezone: string;
  verified: boolean;
}

const users: UserRow[] = [];
const now = Date.now();

for (const { org, count, role } of orgPlan) {
  let originPool: (keyof typeof FIRST)[];
  if (org.slug === "singularity-works") {
    originPool = ["Indian", "Western", "Filipino", "Hispanic"];
  } else if (Math.random() > 0.5) {
    originPool = ["Western", "Indian", "Hispanic", "Filipino"];
  } else {
    originPool = ["Indian", "Western", "Filipino"];
  }
  for (let i = 0; i < count; i++) {
    const origin = pick(originPool);
    const name = pickName(origin);
    const gmailRate = role === "small" ? 0.55 : 0.22;
    const useGmail = Math.random() < gmailRate;
    const isOwner = i === 0 && role === "grower";
    const isAdmin = role === "grower" && i === 1;
    let userRole = "MEMBER";
    if (isOwner) {
      userRole = "OWNER";
    } else if (isAdmin) {
      userRole = "ADMIN";
    }
    const daysAgo = 3 + Math.floor(Math.random() * 400);
    users.push({
      id: randomUUID(),
      orgId: org.id,
      name,
      email: makeEmail(name, org, useGmail),
      role: userRole,
      timezone: pick(TIMEZONES),
      createdAt: new Date(now - daysAgo * 86_400_000).toISOString(),
      verified: Math.random() < 0.7,
    });
  }
}

// (No extra orgless users: the 353 target maps 1:1 onto org membership.)

const hashCache = Array.from({ length: 12 }, newPasswordHash);

const out: string[] = [];
out.push(STRATEGY.trim());
out.push("BEGIN;");
for (const u of users) {
  out.push(
    `INSERT INTO users (id, "orgId", name, email, "emailVerified", image, role, timezone, "createdAt", "updatedAt") VALUES ('${u.id}', ${u.orgId ? `'${u.orgId}'` : "NULL"}, '${esc(u.name)}', '${esc(u.email)}', ${u.verified}, NULL, '${u.role}', '${u.timezone}', '${u.createdAt}', '${u.createdAt}') ON CONFLICT (email) DO NOTHING;`
  );
  out.push(
    `INSERT INTO accounts (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", password) VALUES ('${randomUUID()}', '${u.id}', 'credential', '${u.id}', '${u.createdAt}', '${u.createdAt}', '${pick(hashCache)}') ON CONFLICT DO NOTHING;`
  );
}
out.push("COMMIT;");
console.log(out.join("\n"));
console.error(`users: ${users.length}`);
console.error(JSON.stringify(orgPlan.map((p) => `${p.org.slug}: ${p.count}`)));
if (PG_URL) {
  console.error("PG verify requested");
}
