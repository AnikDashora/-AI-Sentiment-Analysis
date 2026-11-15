using Microsoft.ML.Data;

namespace SentimentAnalysisSystem.Models
{
    public class SentimentPrediction
    {
        [ColumnName("PredictedLabel")]

        public bool Prediction { get; set; }

        public float Score { get; set; }
    }
}
