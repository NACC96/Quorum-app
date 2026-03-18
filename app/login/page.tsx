import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import NavPill from "@/app/components/nav-pill";
import LoginForm from "./login-form";
import styles from "./login.module.css";

export default async function LoginPage(): Promise<React.JSX.Element> {
  const session = await getSession();

  if (session.userId) {
    redirect("/council");
  }

  return (
    <main className={styles.loginPage}>
      <NavPill variant="landing" />
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Welcome Back</h1>
        <p className={styles.loginSubtitle}>Sign in to your Quorum account</p>
        <LoginForm />
        <a href="/" className={styles.backLink}>
          Back to home
        </a>
      </div>
    </main>
  );
}
