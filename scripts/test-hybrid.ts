import { parseChatToNcrHybrid } from "../src/lib/parse-hybrid";

async function main() {
  const plant = `#220공정
JG1 ICCU 하우징 볼트 설체결 
2ea 
격리 조치 후 리워크 대기`;
  const r1 = await parseChatToNcrHybrid(plant, { llmAssistEnabled: true });
  console.log(
    "plant",
    r1.source,
    r1.records[0]?.vehicleModel,
    r1.records[0]?.productName,
    r1.records[0]?.defect,
  );

  // Pattern often misses this prose shape; score is still QC-like → LLM 2차
  const ambiguous = `부적합 관련해서 2ea 나왔고 220공정입니다. 격리 조치했습니다. JG1 ICCU 쪽입니다.`;
  const r2 = await parseChatToNcrHybrid(ambiguous, { llmAssistEnabled: true });
  console.log(
    "ambiguous",
    JSON.stringify(
      {
        source: r2.source,
        score: r2.score,
        reasons: r2.scoreReasons,
        llmMode: r2.llmMode,
        n: r2.records.length,
        row: r2.records[0] && {
          model: r2.records[0].vehicleModel,
          product: r2.records[0].productName,
          defect: r2.records[0].defect,
          qty: r2.records[0].quantity,
          process: r2.records[0].process,
          action: r2.records[0].action,
          note: r2.records[0].note,
        },
      },
      null,
      2,
    ),
  );

  const chat = `네 확인했습니다`;
  const r3 = await parseChatToNcrHybrid(chat, { llmAssistEnabled: true });
  console.log("chitchat", r3.source, r3.score, r3.records.length);

  const off = await parseChatToNcrHybrid(ambiguous, { llmAssistEnabled: false });
  console.log("llm off", off.source, off.records.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
