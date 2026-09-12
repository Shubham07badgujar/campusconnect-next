// Domain constants + normalizers — extracted verbatim from the legacy Express monolith.
/* eslint-disable */
export const BRANCHES = [
  "Computer Engineering",
  "Electrical Engineering",
  "Civil Engineering",
  "Mechanical Engineering",
  "Electronics And TeleCommunication Engineering",
  "Instrumentation Engineering",
];

export const YEAR_KEYS = ["1st", "2nd", "3rd", "4th"];
export const SEMESTER_KEYS = ["1", "2"];
export const JOB_PROFILE_CONFIG = {
  "Permanent Faculty": "PM",
  "Adjunct Faculty": "AD",
  "Visiting Faculty": "VT",
};

export const LEGACY_DEFAULT_SUBJECT_SETS = {
  "Computer Engineering": {
    "1st": [
      "Introduction to Programming",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Data Structures",
      "Algorithms",
      "Computer Networks",
      "Database Systems",
      "Software Engineering",
    ],
    "3rd": [
      "Operating Systems",
      "Database Management",
      "Computer Graphics",
      "Web Development",
      "Mobile App Development",
    ],
    "4th": [
      "Machine Learning",
      "Cloud Computing",
      "Artificial Intelligence",
      "Information Security",
      "Project Management",
    ],
  },
  "Electrical Engineering": {
    "1st": [
      "Basic Electrical",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Circuit Theory",
      "Electromagnetic Fields",
      "Electrical Measurements",
      "Power Systems",
      "Control Systems",
    ],
    "3rd": [
      "Power Electronics",
      "Electrical Machines",
      "Digital Signal Processing",
      "Microprocessors",
      "Renewable Energy",
    ],
    "4th": [
      "High Voltage Engineering",
      "Power System Protection",
      "Electric Drives",
      "Smart Grid",
      "Energy Management",
    ],
  },
  "Civil Engineering": {
    "1st": [
      "Engineering Drawing",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Structural Mechanics",
      "Fluid Mechanics",
      "Surveying",
      "Building Materials",
      "Geology",
    ],
    "3rd": [
      "Design of Structures",
      "Geotechnical Engineering",
      "Transportation Engineering",
      "Water Resources",
      "Environmental Engineering",
    ],
    "4th": [
      "Construction Management",
      "Advanced Structures",
      "Urban Planning",
      "Earthquake Engineering",
      "Project Management",
    ],
  },
  "Mechanical Engineering": {
    "1st": [
      "Engineering Mechanics",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Thermodynamics",
      "Fluid Mechanics",
      "Manufacturing Processes",
      "Materials Science",
      "Machine Drawing",
    ],
    "3rd": [
      "Heat Transfer",
      "Machine Design",
      "CAD/CAM",
      "Industrial Engineering",
      "Metrology",
    ],
    "4th": [
      "Robotics",
      "Power Plant Engineering",
      "Automobile Engineering",
      "Refrigeration",
      "Project Management",
    ],
  },
  "Electronics And TeleCommunication Engineering": {
    "1st": [
      "Basic Electronics",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Signals and Systems",
      "Digital Electronics",
      "Circuit Theory",
      "Microprocessors",
      "Communication Principles",
    ],
    "3rd": [
      "Communication Systems",
      "Microprocessors",
      "Control Systems",
      "Digital Signal Processing",
      "Antenna Theory",
    ],
    "4th": [
      "VLSI Design",
      "Wireless Communication",
      "Optical Communication",
      "Embedded Systems",
      "Satellite Communication",
    ],
  },
  "Instrumentation Engineering": {
    "1st": [
      "Basic Instrumentation",
      "Mathematics I",
      "Physics",
      "Chemistry",
      "Environmental Studies",
    ],
    "2nd": [
      "Transducers",
      "Signal Conditioning",
      "Control Systems",
      "Digital Electronics",
      "Process Control",
    ],
    "3rd": [
      "Industrial Instrumentation",
      "Microprocessors",
      "Digital Signal Processing",
      "Biomedical Instrumentation",
      "Analytical Instrumentation",
    ],
    "4th": [
      "Advanced Control Systems",
      "VLSI Design",
      "Robotics",
      "IoT Systems",
      "Automation",
    ],
  },
};

export const splitYearSubjectsBySemester = (subjects = []) => {
  const midpoint = Math.ceil(subjects.length / 2);
  return {
    1: subjects.slice(0, midpoint),
    2: subjects.slice(midpoint),
  };
};

export const DEFAULT_SUBJECT_SETS = Object.fromEntries(
  Object.entries(LEGACY_DEFAULT_SUBJECT_SETS).map(([branch, yearsMap]) => {
    const semesterWiseYears = Object.fromEntries(
      Object.entries(yearsMap).map(([year, subjects]) => {
        return [year, splitYearSubjectsBySemester(subjects)];
      }),
    );

    return [branch, semesterWiseYears];
  }),
);

export const BRANCH_ALIASES = {
  computer: "Computer Engineering",
  "computer engineering": "Computer Engineering",
  electrical: "Electrical Engineering",
  "electrical engineering": "Electrical Engineering",
  civil: "Civil Engineering",
  "civil engineering": "Civil Engineering",
  mechanical: "Mechanical Engineering",
  "mechanical engineering": "Mechanical Engineering",
  entc: "Electronics And TeleCommunication Engineering",
  electronics: "Electronics And TeleCommunication Engineering",
  "electronics and telecommunication":
    "Electronics And TeleCommunication Engineering",
  "electronics and telecommunication engineering":
    "Electronics And TeleCommunication Engineering",
  instrumentation: "Instrumentation Engineering",
  "instrumentation engineering": "Instrumentation Engineering",
};

export const YEAR_ALIASES = {
  1: "1st",
  "1st": "1st",
  first: "1st",
  2: "2nd",
  "2nd": "2nd",
  second: "2nd",
  3: "3rd",
  "3rd": "3rd",
  third: "3rd",
  4: "4th",
  "4th": "4th",
  fourth: "4th",
};

export const SEMESTER_ALIASES = {
  1: "1",
  sem1: "1",
  "1sem": "1",
  "1stsem": "1",
  semester1: "1",
  "semester 1": "1",
  first: "1",
  2: "2",
  sem2: "2",
  "2sem": "2",
  "2ndsem": "2",
  semester2: "2",
  "semester 2": "2",
  second: "2",
};

export const JOB_PROFILE_ALIASES = {
  permanent: "Permanent Faculty",
  "permanent faculty": "Permanent Faculty",
  adjunct: "Adjunct Faculty",
  "adjunct faculty": "Adjunct Faculty",
  visiting: "Visiting Faculty",
  "visiting faculty": "Visiting Faculty",
};

export const ATTENDANCE_ALLOWED_DISTANCE_METERS = 30;
export const ENFORCE_ATTENDANCE_DISTANCE_CHECK =
  String(process.env.ATTENDANCE_DISTANCE_ENFORCEMENT || "false")
    .trim()
    .toLowerCase() === "true";
export const ATTENDANCE_WINDOW_SECONDS = 60;
export const ATTENDANCE_WINDOW_SLOT_SECONDS = [60, 120, 180, 240, 300, 600];
export const FACE_DESCRIPTOR_LENGTH = 128;
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.5;
export const FACE_CHALLENGE_TTL_MS = 45 * 1000;
export const FACE_LIVENESS_MIN_FRAMES = 2;
export const FACE_LIVENESS_MAX_FRAMES = 5;
// Live captures of the same face always differ slightly between frames;
// byte-identical frames indicate a replayed stored descriptor.
export const FACE_FRAME_MIN_VARIATION = 0.0001;
export const WEBAUTHN_RP_NAME = "CampusConnect";
export const WEBAUTHN_CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const WEBAUTHN_CHALLENGES_COLLECTION = "webauthn_challenges";
export const WEBAUTHN_CREDENTIALS_COLLECTION = "student_passkeys";
export const ATTENDANCE_SETTINGS_COLLECTION = "system_settings";
export const ATTENDANCE_SETTINGS_DOC_ID = "attendance";
export const PASSWORD_RESET_OTP_COLLECTION = "password_reset_otps";
export const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 45 * 1000;
export const PASSWORD_RESET_OTP_SECRET =
  String(
    process.env.PASSWORD_RESET_OTP_SECRET || "campusconnect-password-reset",
  ).trim() || "campusconnect-password-reset";

export const normalizeBranch = (value: unknown = ""): string => {
  const key = String(value).trim().toLowerCase();
  if (!key) return "";
  return (BRANCH_ALIASES as Record<string, string>)[key] || "";
};

export const normalizeYear = (value: unknown = ""): string => {
  const key = String(value).trim().toLowerCase();
  if (!key) return "";
  return (YEAR_ALIASES as Record<string, string>)[key] || "";
};

export const normalizeSemester = (value: unknown = ""): string => {
  const key = String(value).trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return "";
  return (SEMESTER_ALIASES as Record<string, string>)[key] || "";
};

export const normalizeJobProfile = (value: unknown = ""): string => {
  const key = String(value).trim().toLowerCase();
  if (!key) return "";
  return (JOB_PROFILE_ALIASES as Record<string, string>)[key] || "";
};

export const normalizePhone = (value: unknown = ""): string => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 ? digits : "";
};

export const makeSubjectSetDocId = (
  branch: string,
  year: string,
  semester: string,
): string => {
  return `${branch}_${year}_${semester}`
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
};
