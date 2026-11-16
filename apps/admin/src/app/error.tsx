"use client";
export default function Error({ error }: { error: Error }) {
  return <div className="error">Could not reach the Embryo API: {error.message}</div>;
}
