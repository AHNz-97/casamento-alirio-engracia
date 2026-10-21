export function onRequestGet({ request, params }) {
  const token = String(params.token ?? "").trim();
  const target = new URL("/", request.url);
  target.searchParams.set("invite", token);
  return Response.redirect(target.toString(), 302);
}
