// Test: does a plain JSON.parse with an $oid reviver keep "$numberDecimal" objects intact?
const rows = JSON.parse(
  '[{"_id":"6b04081a5b206b89dfd48da3","dec128":{"$numberDecimal":"1.25"},"bin":"YWI="}]',
  (key, value) =>
    value &&
    typeof value === "object" &&
    typeof value.$oid === "string" &&
    Object.keys(value).length === 1
      ? value.$oid
      : value,
);
console.log(JSON.stringify(rows[0]));
console.log("id:", rows[0]._id);
console.log("dec128:", JSON.stringify(rows[0].dec128));
console.log("bin:", rows[0].bin);
