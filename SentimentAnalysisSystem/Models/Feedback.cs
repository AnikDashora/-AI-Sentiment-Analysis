namespace SentimentAnalysisSystem.Models
{
    public class Feedback
    {
        public int id { get; set; }
        public string FeedbackText { get; set; }

        public string Sentiment {  get; set; }

        public DateTime DateSubmitted { get; set; }
    }
}
