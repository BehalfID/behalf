import { permanentRedirect } from "next/navigation";

export default function HomeV2Redirect() {
  permanentRedirect("/");
}
