using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using SentimentAnalysisSystem.Data;
using SentimentAnalysisSystem.Models;
using SentimentAnalysisSystem.Services;

namespace SentimentAnalysisSystem.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FeedbackController : ControllerBase
    {
        private readonly SentimentAnalysisService _sentimentService;
        private readonly FeedbackContext _db;

        public FeedbackController(SentimentAnalysisService sentimentService, FeedbackContext db)
        {
            _sentimentService = sentimentService;
            _db = db;
        }

        [HttpPost("analyze")]
        public async Task<IActionResult> AnalyzeFeedback([FromBody] FeedbackRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.FeedbackText))
                return BadRequest("FeedbackText Cannot be empty");

            string sentiment = _sentimentService.AnalyzeSentiment(req.FeedbackText);

            var feedback = new Feedback
            {
                FeedbackText = req.FeedbackText,
                Sentiment = sentiment,
                DateSubmitted = DateTime.UtcNow
            };

            _db.Feedbacks.Add(feedback);
            await _db.SaveChangesAsync();

            var response = new FeedbackResponse
            {
                Sentiment = sentiment
            };

            return Ok(response);
        }
    }
}
