"use client";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

export default function Stub({ id, icon }: { id: string; icon: string }) {
  const { t } = useLang();
  const title = t("nav." + id);
  return (
    <>
      <div className="vh"><div><h1>{title}</h1></div></div>
      <div className="stub">
        <div>
          <div className="ic"><Icon name={icon} /></div>
          <h2>{title}</h2>
          <p>{t("stub.note")}</p>
        </div>
      </div>
    </>
  );
}
