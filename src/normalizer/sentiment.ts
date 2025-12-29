/**
 * Rule-based sentiment analysis
 */

export interface SentimentResult {
  score: number; // -1 to 1
  positiveWords: string[];
  negativeWords: string[];
  confidence: number; // 0 to 1
}

// Positive word lists
const POSITIVE_WORDS = new Set([
  // Strong positive
  'love', 'amazing', 'excellent', 'perfect', 'best', 'fantastic', 'awesome',
  'wonderful', 'incredible', 'outstanding', 'superb', 'brilliant',
  // Moderate positive
  'great', 'good', 'nice', 'happy', 'satisfied', 'recommend', 'quality',
  'beautiful', 'lovely', 'pretty', 'smooth', 'soft', 'gentle', 'effective',
  'works', 'helped', 'improved', 'love it', 'worth',
  // Mild positive
  'okay', 'fine', 'decent', 'alright', 'fair',
]);

const STRONG_POSITIVE = new Set([
  'love', 'amazing', 'excellent', 'perfect', 'best', 'fantastic', 'awesome',
  'wonderful', 'incredible', 'outstanding', 'superb', 'brilliant',
]);

// Negative word lists
const NEGATIVE_WORDS = new Set([
  // Strong negative
  'hate', 'terrible', 'awful', 'horrible', 'worst', 'disgusting', 'waste',
  'scam', 'fake', 'fraud', 'disappointing', 'useless',
  // Moderate negative
  'bad', 'poor', 'cheap', 'broken', 'damaged', 'defective', 'wrong',
  'disappointed', 'unhappy', 'regret', 'refund', 'return', 'never',
  'doesn\'t work', 'not working', 'didn\'t work',
  // Mild negative
  'meh', 'mediocre', 'underwhelming',
]);

const STRONG_NEGATIVE = new Set([
  'hate', 'terrible', 'awful', 'horrible', 'worst', 'disgusting', 'waste',
  'scam', 'fake', 'fraud',
]);

// Intensifiers
const INTENSIFIERS = new Set([
  'very', 'really', 'extremely', 'absolutely', 'totally', 'completely',
  'super', 'highly', 'incredibly', 'so',
]);

// Negators
const NEGATORS = new Set([
  'not', 'no', 'never', 'don\'t', 'doesn\'t', 'didn\'t', 'won\'t',
  'wouldn\'t', 'couldn\'t', 'shouldn\'t', 'isn\'t', 'aren\'t', 'wasn\'t',
]);

/**
 * Analyze sentiment of text using rule-based approach
 */
export function analyzeSentiment(text: string | null | undefined): SentimentResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      positiveWords: [],
      negativeWords: [],
      confidence: 0,
    };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  const positiveFound: string[] = [];
  const negativeFound: string[] = [];

  let positiveScore = 0;
  let negativeScore = 0;
  let prevWord = '';
  let prevPrevWord = '';

  for (const word of words) {
    const cleanWord = word.replace(/[.,!?;:'"]/g, '');

    // Check for negation
    const isNegated = NEGATORS.has(prevWord) || NEGATORS.has(prevPrevWord);
    const hasIntensifier = INTENSIFIERS.has(prevWord);
    const multiplier = hasIntensifier ? 1.5 : 1;

    if (POSITIVE_WORDS.has(cleanWord)) {
      if (isNegated) {
        // Negated positive = negative
        negativeScore += 0.5 * multiplier;
        negativeFound.push(cleanWord);
      } else {
        const strength = STRONG_POSITIVE.has(cleanWord) ? 1.5 : 1;
        positiveScore += strength * multiplier;
        positiveFound.push(cleanWord);
      }
    }

    if (NEGATIVE_WORDS.has(cleanWord)) {
      if (isNegated) {
        // Negated negative = positive (weak)
        positiveScore += 0.3 * multiplier;
        positiveFound.push(cleanWord);
      } else {
        const strength = STRONG_NEGATIVE.has(cleanWord) ? 1.5 : 1;
        negativeScore += strength * multiplier;
        negativeFound.push(cleanWord);
      }
    }

    prevPrevWord = prevWord;
    prevWord = cleanWord;
  }

  // Check for phrases
  const positivePatterns = [
    /highly recommend/i,
    /love it/i,
    /works great/i,
    /worth (the|every) (money|penny)/i,
    /will buy again/i,
    /exceeded expectations/i,
  ];

  const negativePatterns = [
    /waste of (money|time)/i,
    /don't buy/i,
    /not worth/i,
    /fell apart/i,
    /broke after/i,
    /want (a |my )?refund/i,
    /return(ed|ing)?/i,
  ];

  for (const pattern of positivePatterns) {
    if (pattern.test(lowerText)) {
      positiveScore += 1;
    }
  }

  for (const pattern of negativePatterns) {
    if (pattern.test(lowerText)) {
      negativeScore += 1;
    }
  }

  // Calculate final score
  const total = positiveScore + negativeScore;
  let score: number;
  let confidence: number;

  if (total === 0) {
    score = 0;
    confidence = 0;
  } else {
    score = (positiveScore - negativeScore) / total;
    // Clamp to [-1, 1]
    score = Math.max(-1, Math.min(1, score));
    // Confidence based on how many words were matched
    confidence = Math.min(1, total / 5);
  }

  return {
    score: Math.round(score * 100) / 100,
    positiveWords: [...new Set(positiveFound)].slice(0, 5),
    negativeWords: [...new Set(negativeFound)].slice(0, 5),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Calculate average sentiment from multiple results
 */
export function averageSentiment(results: SentimentResult[]): number | null {
  if (results.length === 0) return null;

  const validResults = results.filter((r) => r.confidence > 0);
  if (validResults.length === 0) return null;

  const sum = validResults.reduce((acc, r) => acc + r.score * r.confidence, 0);
  const totalWeight = validResults.reduce((acc, r) => acc + r.confidence, 0);

  return Math.round((sum / totalWeight) * 100) / 100;
}

/**
 * Classify sentiment score into categories
 */
export function classifySentiment(
  score: number | null,
): 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive' | 'unknown' {
  if (score === null) return 'unknown';
  if (score <= -0.6) return 'very_negative';
  if (score <= -0.2) return 'negative';
  if (score <= 0.2) return 'neutral';
  if (score <= 0.6) return 'positive';
  return 'very_positive';
}

/**
 * Extract complaint keywords from negative reviews
 */
export function extractComplaintKeywords(
  text: string,
  sentimentScore: number,
): string[] {
  if (sentimentScore > -0.3) return [];

  const complaints = new Set<string>();
  const lowerText = text.toLowerCase();

  // Common complaint patterns
  const complaintPatterns = [
    { pattern: /broke|broken|break/g, keyword: 'broken' },
    { pattern: /fake|counterfeit/g, keyword: 'fake' },
    { pattern: /cheap|flimsy/g, keyword: 'cheap quality' },
    { pattern: /smell|odor|stink/g, keyword: 'bad smell' },
    { pattern: /damage|damaged/g, keyword: 'damaged' },
    { pattern: /late|delay|slow shipping/g, keyword: 'shipping delay' },
    { pattern: /wrong|incorrect/g, keyword: 'wrong item' },
    { pattern: /missing|incomplete/g, keyword: 'missing parts' },
    { pattern: /doesn't fit|too small|too big/g, keyword: 'size issue' },
    { pattern: /refund|return/g, keyword: 'wants refund' },
    { pattern: /scam|fraud|rip.?off/g, keyword: 'scam' },
    { pattern: /not as (described|pictured|shown)/g, keyword: 'misleading' },
  ];

  for (const { pattern, keyword } of complaintPatterns) {
    if (pattern.test(lowerText)) {
      complaints.add(keyword);
    }
  }

  return Array.from(complaints).slice(0, 5);
}

/**
 * Extract praise keywords from positive reviews
 */
export function extractPraiseKeywords(
  text: string,
  sentimentScore: number,
): string[] {
  if (sentimentScore < 0.3) return [];

  const praises = new Set<string>();
  const lowerText = text.toLowerCase();

  // Common praise patterns
  const praisePatterns = [
    { pattern: /fast shipping|quick delivery/g, keyword: 'fast shipping' },
    { pattern: /great quality|high quality|good quality/g, keyword: 'quality' },
    { pattern: /worth (the |every )?(money|penny)/g, keyword: 'value' },
    { pattern: /recommend|highly recommend/g, keyword: 'recommended' },
    { pattern: /love it|love this/g, keyword: 'loved' },
    { pattern: /perfect fit|fits perfect/g, keyword: 'good fit' },
    { pattern: /as described|as pictured/g, keyword: 'accurate' },
    { pattern: /buy again|repurchase/g, keyword: 'repurchase' },
    { pattern: /beautiful|gorgeous|pretty/g, keyword: 'beautiful' },
    { pattern: /effective|works well/g, keyword: 'effective' },
    { pattern: /easy to use/g, keyword: 'easy to use' },
    { pattern: /great packaging/g, keyword: 'packaging' },
  ];

  for (const { pattern, keyword } of praisePatterns) {
    if (pattern.test(lowerText)) {
      praises.add(keyword);
    }
  }

  return Array.from(praises).slice(0, 5);
}
