import { motion } from "framer-motion";
import { Flame, TrendingUp } from "lucide-react";

export default function Dashboard() {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}}>
      <h1>🔥 Nuclear Dashboard</h1>
      <div style={{display:"flex",gap:"20px",marginTop:"20px"}}>
        <Card icon={<Flame />} label="Active Kitchens" value="24" />
        <Card icon={<TrendingUp />} label="Revenue" value="$14,820" />
      </div>
    </motion.div>
  );
}

function Card({icon,label,value}){
  return (
    <div style={{background:"#1e293b",padding:"20px",borderRadius:"15px",width:"200px"}}>
      {icon}
      <h3>{value}</h3>
      <p style={{opacity:0.6}}>{label}</p>
    </div>
  );
}
