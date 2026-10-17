import type { FormEvent } from "react";

type Props = {
  username: string;
  password: string;
  error: string;
  onUsername: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
};

export function AdminLogin({ username, password, error, onUsername, onPassword, onSubmit }: Props) {
  return (
    <div className="shell" style={{ maxWidth: 420 }}>
      <h1 className="brand">GeekCentral</h1>
      <p className="muted">Acesso só da equipe — geeks · Celular e Game</p>
      <form className="panel" onSubmit={onSubmit}>
        <div className="field">
          <label>Usuário</label>
          <input
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            data-testid="admin-username"
            placeholder="dono (vazio só no 1º acesso)"
          />
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="admin-password"
          />
        </div>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button className="btn" type="submit" data-testid="admin-login">
          Entrar
        </button>
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Loja: <code>https://loja.geekloja.com.br</code> · Casa: <code>https://admin.geekloja.com.br</code>
        </p>
      </form>
    </div>
  );
}
