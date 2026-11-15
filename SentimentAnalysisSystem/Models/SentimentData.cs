using Microsoft.ML.Data;
namespace SentimentAnalysisSystem.Models
{
    public class SentimentData
    {
        [LoadColumn(0)]
        public string Text { get; set; }

        [LoadColumn(1)]

        public bool Sentiment { get; set; }

    }
}
