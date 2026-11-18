-- Optional pilot for the tutor API. Run once after applying the Step 1 schema.
-- A repeated run skips an existing question, including one an editor has revised.
with new_question as (
  insert into public.questions (
    id, source_name, paper_slug, source_qid, language_code, source_url, attribution,
    exam, exam_year, exam_date, paper_number, question_number, subject, chapter, topic,
    kind, stem_md, source_answer_key, is_published
  )
  values (
    'e6735659-65fc-5618-b6b3-b5c9ab30e52d',
    'JEE (Advanced)', 'jee-advanced-2025-paper-1', 'mathematics-10', 'en',
    'https://jeeadv.ac.in/past_qps/2025_1_English.pdf#page=5',
    'Adapted from JEE (Advanced) 2025, Paper 1, Mathematics, question 10.',
    'jee_advanced', 2025, date '2025-05-18', 1, '10', 'mathematics',
    'Permutations and combinations', 'Inclusion-exclusion',
    'numerical',
    'Build a seven-digit positive integer using only 0, 1 and 2, with repetition allowed. How many such integers contain exactly two zeros, exactly two ones, or both?',
    '762'::jsonb, true
  )
  on conflict do nothing
  returning id, content_revision
)
insert into public.verified_solutions (
  question_id, question_revision, answer_md, solution_md, source_reference, verifier_label
)
select
  id, content_revision, '762',
  $solution$1. Count numbers with exactly two zeros. Both zeros must be among the last six positions. Choose those two positions, then fill each of the five remaining positions with 1 or 2. This gives $\binom{6}{2}2^5=480$.

2. Count numbers with exactly two ones. First allow a leading zero. Choose any two positions for the ones, then fill each remaining position with 0 or 2. Of these strings, $\binom{6}{2}2^4$ start with zero, since their first digit is fixed. The valid count is $\binom{7}{2}2^5-\binom{6}{2}2^4=432$.

3. Count the overlap. Choose two zero positions from the last six and two one positions from the remaining five. Fill the remaining three positions with 2. There are $\binom{6}{2}\binom{5}{2}=150$ such numbers.

4. Each number in the overlap was counted twice. Subtract its extra count once to obtain $480+432-150=762$.$solution$,
  'JEE (Advanced) 2025, Paper 1, Mathematics Q10. The answer annotation on page 5 gives 762. https://jeeadv.ac.in/past_qps/2025_1_English.pdf#page=5',
  'Official key cross-check and independent exhaustive enumeration'
from new_question;
