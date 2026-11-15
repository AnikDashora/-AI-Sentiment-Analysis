using Microsoft.EntityFrameworkCore;
using SentimentAnalysisSystem.Models;

namespace SentimentAnalysisSystem.Data
{
    public class FeedbackContext : DbContext
    {
        public FeedbackContext(DbContextOptions<FeedbackContext>options) : base(options) { }

        public DbSet<Feedback> Feedbacks { get; set; }
    }
}
