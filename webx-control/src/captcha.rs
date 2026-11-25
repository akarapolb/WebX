//! The visitors' captcha (docs/target-architecture.md, track C5, decision D12): the small sum a form asks before it is
//! accepted. A port of strapi-cms/src/utils/captcha.ts: the sum is made here, its answer is kept here (never sent), and a
//! challenge is good for one try within five minutes, so a solved one cannot be reused for a flood of submissions.
//! The form routes check it; `GET /api/captcha` hands one out.
use std::collections::HashMap;

/// How long a challenge may be answered.
pub const TTL_MS: i64 = 5 * 60 * 1000;
/// Past this many open challenges the table is swept of expired ones.
const SWEEP_AT: usize = 5_000;
/// Past this many unexpired ones no new one is given (a caller opening them and never answering cannot grow it without end).
const MAX_OPEN: usize = 20_000;

#[derive(Default)]
pub struct Captchas {
    open: HashMap<String, (u32, i64)>,
}

/// One random digit 1..=9, without the bias a plain `% 9` of a byte has.
fn digit() -> u32 {
    let mut b = [0u8; 1];
    loop {
        getrandom::getrandom(&mut b).expect("random bytes");
        if b[0] < 252 {
            return u32::from(b[0] % 9) + 1;
        }
    }
}

fn new_id() -> String {
    let mut b = [0u8; 9];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

impl Captchas {
    /// A new challenge at `now`: its id and the question to show. None when too many are open already.
    pub fn issue(&mut self, now: i64) -> Option<(String, String)> {
        if self.open.len() > SWEEP_AT {
            self.open.retain(|_, (_, exp)| *exp >= now);
        }
        if self.open.len() >= MAX_OPEN {
            return None;
        }
        let (a, b) = (digit(), digit());
        let id = new_id();
        self.open.insert(id.clone(), (a + b, now + TTL_MS));
        Some((id, format!("{a} + {b} = ?")))
    }

    /// Whether `answer` solves challenge `id` at `now`. The challenge is used up either way, so a wrong guess cannot be
    /// followed by another on the same one.
    #[allow(dead_code)] // checked by the form routes (docs/target-architecture.md, track C5), which are next
    pub fn verify(&mut self, id: &str, answer: &serde_json::Value, now: i64) -> bool {
        let Some((sum, exp)) = self.open.remove(id) else { return false };
        if exp < now {
            return false;
        }
        let given = match answer {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
            _ => None,
        };
        given == Some(f64::from(sum))
    }

    #[cfg(test)]
    fn open(&self) -> usize {
        self.open.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn solve(question: &str) -> u32 {
        let nums: Vec<u32> = question.split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty()).map(|s| s.parse().unwrap()).collect();
        nums[0] + nums[1]
    }

    #[test]
    fn a_challenge_is_a_sum_of_two_digits_and_the_right_answer_passes_once() {
        let mut c = Captchas::default();
        let (id, q) = c.issue(1000).unwrap();
        assert!(q.ends_with(" = ?") && q.contains(" + "), "{q}");
        let nums: Vec<u32> = q.split(|ch: char| !ch.is_ascii_digit()).filter(|s| !s.is_empty()).map(|s| s.parse().unwrap()).collect();
        assert!(nums.iter().all(|n| (1..=9).contains(n)), "{q}");
        assert_eq!(id.len(), 18);
        assert!(c.verify(&id, &json!(solve(&q)), 2000), "the right answer passes");
        assert!(!c.verify(&id, &json!(solve(&q)), 2001), "and only once");
    }

    #[test]
    fn the_answer_may_be_a_number_or_text_with_spaces_but_not_something_else() {
        let mut c = Captchas::default();
        for answer in [json!("  {}  "), json!("{}.0"), json!("{}")] {
            let (id, q) = c.issue(0).unwrap();
            let s = answer.as_str().unwrap().replace("{}", &solve(&q).to_string());
            assert!(c.verify(&id, &json!(s), 1), "{s}");
        }
        let (id, q) = c.issue(0).unwrap();
        assert!(c.verify(&id, &json!(solve(&q) as f64), 1), "a JSON number, even a float");
        for bad in [json!(null), json!(true), json!([1]), json!("seven"), json!("")] {
            let (id, _) = c.issue(0).unwrap();
            assert!(!c.verify(&id, &bad, 1), "{bad}");
        }
    }

    #[test]
    fn a_wrong_answer_uses_the_challenge_up_so_there_is_no_second_guess() {
        let mut c = Captchas::default();
        let (id, q) = c.issue(0).unwrap();
        assert!(!c.verify(&id, &json!(solve(&q) + 1), 1));
        assert!(!c.verify(&id, &json!(solve(&q)), 2), "the right answer no longer helps");
    }

    #[test]
    fn an_unknown_or_expired_challenge_fails() {
        let mut c = Captchas::default();
        assert!(!c.verify("nope", &json!(5), 0));
        let (id, q) = c.issue(0).unwrap();
        assert!(!c.verify(&id, &json!(solve(&q)), TTL_MS + 1), "past five minutes");
        let (id, q) = c.issue(0).unwrap();
        assert!(c.verify(&id, &json!(solve(&q)), TTL_MS), "right at the limit is still in time");
    }

    #[test]
    fn expired_challenges_are_swept_and_the_table_has_a_ceiling() {
        let mut c = Captchas::default();
        for _ in 0..SWEEP_AT + 1 {
            c.issue(0).unwrap();
        }
        assert_eq!(c.open(), SWEEP_AT + 1);
        c.issue(TTL_MS + 10).unwrap();
        assert_eq!(c.open(), 1, "the expired ones went when the table was over the sweep size");
        let mut full = Captchas::default();
        for _ in 0..MAX_OPEN {
            full.issue(0).unwrap();
        }
        assert!(full.issue(1).is_none(), "no more once MAX_OPEN are open and none has expired");
        assert!(full.issue(TTL_MS + 1).is_some(), "but expired ones make room");
    }
}
