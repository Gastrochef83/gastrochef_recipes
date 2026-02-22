import { Routes, Route, Link } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import Control from "./Control.jsx";

export default function App() {
  return (
    <div style={{display:"flex",height:"100vh",color:"white"}}>
      <nav style={{width:"220px",background:"#1e293b",padding:"20px"}}>
        <h2>NUCLEAR V3</h2>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <Link style={{color:"white"}} to="/">Dashboard</Link>
          <Link style={{color:"white"}} to="/control">Control Panel</Link>
        </div>
      </nav>
      <main style={{flex:1,padding:"40px",background:"#0f172a"}}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/control" element={<Control />} />
        </Routes>
      </main>
    </div>
  );
}
