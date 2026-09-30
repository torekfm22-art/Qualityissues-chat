import { appendTrainingSample, getLexicon, getFewShotExamples } from "../src/lib/training";
import { getDefectWordRegex, scoreQualityMessage } from "../src/lib/parse-ncr";
import { parseChatToNcrHybrid } from "../src/lib/parse-hybrid";

async function main() {
  const { lexicon } = appendTrainingSample({
    messageId: "test-msg-1",
    text: "신규용어 테스트: HZ9 ICCU 핀휨 3ea 격리",
    before: { productName: "HZ9 ICCU", defect: "핀휨" },
    after: {
      vehicleModel: "HZ9",
      productName: "ICCU",
      defect: "핀휨",
      process: "100공정",
      quantity: "3ea",
      action: "격리",
    },
    parseSource: "llm_mock",
    kind: "correct",
  });

  console.log("lexicon", {
    models: lexicon.vehicleModels,
    products: lexicon.productNames,
    defects: lexicon.defectTerms,
    sampleCount: lexicon.sampleCount,
  });

  const re = getDefectWordRegex(lexicon.defectTerms);
  console.log("defect matches 핀휨", re.test("핀휨 발생"));
  console.log(
    "score with learned",
    scoreQualityMessage("HZ9 ICCU 핀휨 3ea", {
      extraDefectTerms: lexicon.defectTerms,
      learnedVehicleModels: lexicon.vehicleModels,
      learnedProductNames: lexicon.productNames,
    }),
  );
  const hybrid = await parseChatToNcrHybrid("HZ9 ICCU 핀휨 3ea #100공정");
  console.log("hybrid via lexicon", hybrid.source, hybrid.scoreReasons, {
    model: hybrid.records[0]?.vehicleModel,
    product: hybrid.records[0]?.productName,
    defect: hybrid.records[0]?.defect,
  });
  console.log("fewshot", getFewShotExamples(2).length);
  console.log("lexicon file", getLexicon().sampleCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
