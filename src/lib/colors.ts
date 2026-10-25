export interface AvatarColor {
  id: string;
  name: string;
  note?: string;
  /** main color — used for the profile outline + background behind the pfp */
  hex: string;
  /** softer tint used behind initials / gradients */
  soft: string;
  gradient: string;
}

export const AVATAR_COLORS: AvatarColor[] = [
  {
    id: "black",
    name: "Default (Black)",
    note: "if.. ur boring 😴",
    hex: "#43434f",
    soft: "#1c1c22",
    gradient: "linear-gradient(135deg,#1c1c22,#33333f)",
  },
  {
    id: "yellow",
    name: "Yellow",
    hex: "#ffc61a",
    soft: "#3a2e05",
    gradient: "linear-gradient(135deg,#ffc61a,#ff9d00)",
  },
  {
    id: "pink",
    name: "Pink",
    hex: "#ff5d8f",
    soft: "#3d1222",
    gradient: "linear-gradient(135deg,#ff5d8f,#ff2e63)",
  },
  {
    id: "purple",
    name: "Purple",
    hex: "#8b5cf6",
    soft: "#241543",
    gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
  },
  {
    id: "blue",
    name: "Blue",
    hex: "#3b82f6",
    soft: "#10233f",
    gradient: "linear-gradient(135deg,#3b82f6,#2563eb)",
  },
  {
    id: "teal",
    name: "Teal",
    hex: "#14b8a6",
    soft: "#07332e",
    gradient: "linear-gradient(135deg,#14b8a6,#0d9488)",
  },
  {
    id: "green",
    name: "Green",
    hex: "#22c55e",
    soft: "#0c2b16",
    gradient: "linear-gradient(135deg,#22c55e,#16a34a)",
  },
  {
    id: "orange",
    name: "Orange",
    hex: "#fb7c1e",
    soft: "#3d1e05",
    gradient: "linear-gradient(135deg,#fb7c1e,#ea580c)",
  },
  {
    id: "red",
    name: "Red",
    hex: "#ef4444",
    soft: "#3a1010",
    gradient: "linear-gradient(135deg,#ef4444,#dc2626)",
  },
];

export function colorById(id: string | undefined): AvatarColor {
  return AVATAR_COLORS.find((c) => c.id === id) ?? AVATAR_COLORS[0];
}
