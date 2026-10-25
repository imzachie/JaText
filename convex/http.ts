import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth routes: /api/auth/signin, /api/auth/callback/google, …
auth.addHttpRoutes(http);

export default http;
