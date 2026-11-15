using Microsoft.ML;
using SentimentAnalysisSystem.Models;
using System.Text.RegularExpressions;

namespace SentimentAnalysisSystem.Services
{
    public class SentimentAnalysisService
    {
        private readonly PredictionEngine<SentimentData, SentimentPrediction> _predictor;

        private static readonly HashSet<string> PositiveWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "amazing", "best", "brilliant", "clean", "comfortable", "delighted", "easy", "excellent",
            "fantastic", "fast", "friendly", "good", "great", "happy", "helpful", "impressed", "intuitive",
            "love", "pleasant", "pleased", "recommend", "reliable", "smooth", "satisfied", "solid", "top",
            "wonderful", "works", "worth"
        };

        private static readonly HashSet<string> NegativeWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "annoying", "awful", "bad", "broken", "buggy", "cheap", "confusing", "crashes", "defective",
            "disappointed", "disappointing", "dirty", "delayed", "error", "expensive", "failed", "frustrating", "hate",
            "horrible", "ignored", "late", "poor", "rude", "sad", "slow", "terrible", "unhappy", "unhelpful",
            "unreliable", "useless", "weak", "worst", "wrong"
        };

        private static readonly HashSet<string> FactualWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "account", "arrived", "contains", "delivered", "invoice", "order", "package", "received",
            "scheduled", "shipment", "shipped", "status", "today", "tomorrow", "tracking", "updated", "yesterday"
        };

        private static readonly HashSet<string> NegationWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "not", "never", "no", "don't", "doesn't", "didn't", "isn't", "wasn't", "can't", "cannot"
        };

        public SentimentAnalysisService()
        {
            var mlContext = new MLContext(seed: 1);
            var dataPath = Path.Combine(AppContext.BaseDirectory, "Data", "sentiment-labelled-sentences.tsv");

            IDataView dataView = mlContext.Data.LoadFromTextFile<SentimentData>(
                path: dataPath,
                hasHeader: true,
                separatorChar: '\t');

            var pipeline = mlContext.Transforms.Text
                .FeaturizeText("Features", nameof(SentimentData.Text))
                .Append(mlContext.BinaryClassification
                    .Trainers.SdcaLogisticRegression(
                        labelColumnName: nameof(SentimentData.Sentiment),
                        featureColumnName: "Features"));

            var model = pipeline.Fit(dataView);

            _predictor = mlContext.Model
                .CreatePredictionEngine<SentimentData, SentimentPrediction>(model);
        }

        public string AnalyzeSentiment(string feedback)
        {
            var lexicalScore = GetLexicalScore(feedback);
            if (lexicalScore != 0)
                return lexicalScore > 0 ? "Positive" : "Negative";

            if (ContainsFactualLanguage(feedback))
                return "Neutral";

            var input = new SentimentData { Text = feedback };
            var predResult = _predictor.Predict(input);

            if (Math.Abs(predResult.Score) < 0.15f)
                return "Neutral";

            return predResult.Score > 0 ? "Positive" : "Negative";
        }

        private static int GetLexicalScore(string feedback)
        {
            var words = Regex.Matches(feedback.ToLowerInvariant(), "[a-z']+")
                .Select(match => match.Value)
                .ToArray();
            var score = 0;

            for (var index = 0; index < words.Length; index++)
            {
                var word = words[index];
                var wordScore = PositiveWords.Contains(word) ? 1 : NegativeWords.Contains(word) ? -1 : 0;
                if (wordScore == 0)
                    continue;

                if (index > 0 && NegationWords.Contains(words[index - 1]))
                    wordScore *= -1;

                score += wordScore;
            }

            return score;
        }

        private static bool ContainsFactualLanguage(string feedback)
        {
            var words = Regex.Matches(feedback.ToLowerInvariant(), "[a-z']+")
                .Select(match => match.Value);

            return words.Any(FactualWords.Contains);
        }
    }
}

