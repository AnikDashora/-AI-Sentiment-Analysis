using Microsoft.EntityFrameworkCore;
using SentimentAnalysisSystem.Data;
using SentimentAnalysisSystem.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<FeedbackContext>(
    options => options.UseSqlServer(builder.Configuration.GetConnectionString("SentimentDb")));

builder.Services.AddSingleton<SentimentAnalysisService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.Run();
