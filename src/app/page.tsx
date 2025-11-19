import Image from "next/image";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ArticleList from "@/components/ArticleList";

export default function Home() {
  return (
    <>
      <Header />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <ArticleList />
      </div>
    </>
  );
}
