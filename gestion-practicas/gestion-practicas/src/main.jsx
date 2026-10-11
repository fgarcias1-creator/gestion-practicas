import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <App />
);

return (
  <div className="login-page">
    <div className="login-card">

      <h1>Gestión de Prácticas</h1>

      <p>
        Sistema de seguimiento académico
      </p>

      <form onSubmit={ingresar}>

        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />

        <button
          className="btn-primary"
          style={{width:"100%"}}
        >
          Ingresar
        </button>

      </form>

    </div>
  </div>
);
